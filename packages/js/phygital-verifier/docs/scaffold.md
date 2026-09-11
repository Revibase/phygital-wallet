# Verifier Scaffold

A minimal, framework-agnostic reference implementation of the five endpoints in
[`verifier-http.md`](./verifier-http.md). It uses only Web-standard `Request` /
`Response`, so it drops into Cloudflare Workers, Node (`node:http` / Hono /
Express adapters), Deno, or Bun.

`phygital-verifier-sdk` gives you the proof and bearer primitives. Four things
are deployment-specific and left as stubs you must supply:

1. **Signing** — your verifier's Ed25519 key (the one registered on-chain in the
   token's `TokenVerifier` / `Config`). Keep the private key server-side; never
   ship it to a browser.
2. **Counter store** — a durable, per-`(kind, identifier)` monotonic high-water
   mark. Check-and-advance must be **atomic** (serialize per token) or replays
   slip through.
3. **RPC** — a Solana RPC the verifier can reach (for `isBlockhashValid` and, on
   the tap path, the accessory→token lookup).
4. **Policy** — your transaction rules, authored with `policy(...)` (see
   [`writing-policies.md`](./writing-policies.md)).

> **Serialize per token.** Verify → consume the replay counter → mint the bearer
> must run as one critical section for a given token, so a proof can't be
> accepted by one request and minted by another. On Cloudflare a per-token
> Durable Object gives you this for free; elsewhere use a per-token lock.

```ts
import {
  ConnectProofError,
  normalizeOrigin,
  signVerifierBearer,
  verifyConnectProof,
  verifyDynamicConnectProof,
  verifyVerifierBearer,
  policy,
  type VerifierBearerPayload,
} from "phygital-verifier-sdk";
import {
  createSolanaRpc,
  getBase58Encoder,
  type Address,
} from "@solana/kit";
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
} from "phygital-token-sdk";
// Read the token's on-chain TokenVerifier override (its configured verifier).
import {
  decodeTokenVerifier,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";
import { fetchEncodedAccounts } from "@solana/kit";

const SESSION_TTL_MS = 15 * 60 * 1000;
const base58 = getBase58Encoder();

// 1. Signing — your verifier identity. Replace with a KMS/HSM in production.
//    `address` is the base58 Ed25519 pubkey recorded on-chain.
declare const verifierKey: {
  address: string;
  sign: (message: Uint8Array) => Promise<Uint8Array>;
};

// 2. Counter store — durable, atomic, monotonic per (kind, identifier).
//    Returns true only when `counter` is strictly newer than what is stored.
declare const counters: {
  consume: (
    kind: "webauthn" | "tap",
    identifier: string,
    counter: number,
  ) => Promise<boolean>;
};

// 3. RPC.
const rpc = createSolanaRpc(process.env.RPC_URL!);

// 4. Policy — what this verifier is willing to co-sign.
const txPolicy = policy([/* allow(...) / deny(...) rules — see writing-policies.md */]);

// ── on-chain helpers ────────────────────────────────────────────────────────

/**
 * The verifier this token is configured to use. A custom verifier only serves
 * tokens explicitly pointed at it via a `TokenVerifier` override — there is no
 * Config-default fallback (those are Revibase's own paymaster verifiers). If the
 * override is absent, the token is not ours.
 */
async function tokenVerifier(token: Address): Promise<string> {
  const [tvPda] = await findTokenVerifierPda({ phygitalToken: token });
  const [tv] = await fetchEncodedAccounts(rpc, [tvPda]);
  const override = decodeTokenVerifier(tv);
  if (!override.exists) {
    throw new ConnectProofError(
      "token_not_found",
      "This token is not configured for this verifier",
    );
  }
  return String(override.data.verifier);
}

/** Does this service hold the key the token is configured to use? */
async function canSignFor(token: Address): Promise<boolean> {
  return (await tokenVerifier(token)) === verifierKey.address;
}

function bearerResponse(minted: { accessToken: string; expiresAt: number }, token: Address) {
  return Response.json({
    accessToken: minted.accessToken,
    tokenType: "Bearer",
    expiresAt: minted.expiresAt,
    expiresIn: Math.max(0, Math.floor((minted.expiresAt - Date.now()) / 1000)),
    phygitalToken: String(token),
  });
}

function proofErr(err: unknown) {
  if (err instanceof ConnectProofError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  return Response.json({ error: "Connect failed", code: "invalid_proof" }, { status: 400 });
}

async function mint(token: Address, origin: string | null) {
  if (!(await canSignFor(token))) {
    return Response.json(
      { error: "This item uses a different verifier", code: "verifier_mismatch" },
      { status: 403 },
    );
  }
  const minted = await signVerifierBearer(
    { sub: String(token), iss: verifierKey.address, origin, ttlMs: SESSION_TTL_MS },
    verifierKey.sign,
  );
  return bearerResponse(minted, token);
}

// ── endpoints ─────────────────────────────────────────────────────────────

/** GET /health */
function health() {
  return Response.json({ ok: true });
}

/** POST /connect — WebAuthn over a recent blockhash. */
async function connect(req: Request) {
  const body = (await req.json()) as { blockhash?: string; response?: unknown };
  const origin = normalizeOrigin(req.headers.get("Origin"));
  try {
    const { phygitalToken } = await verifyConnectProof(
      { blockhash: body.blockhash as string, response: body.response as never },
      {
        // Stateless freshness check — inject it so it runs where it scales best.
        isBlockhashValid: (bh) =>
          rpc.isBlockhashValid(bh, { commitment: "confirmed" }).send()
            .then((r) => r.value),
        consumeSignCount: ({ identifier, signCount }) =>
          counters.consume("webauthn", identifier, signCount),
      },
    );
    return mint(phygitalToken, origin);
  } catch (err) {
    return proofErr(err);
  }
}

/** POST /connect/tap — dynamic NFC URL. Gate to your app origins. */
async function connectTap(req: Request) {
  const origin = normalizeOrigin(req.headers.get("Origin"));
  // Browser-only flow: require a present, allowlisted app origin (reject a
  // missing Origin — a non-browser caller has no business here).
  if (!origin || !isAppOrigin(origin)) {
    return Response.json({ error: "Forbidden", code: "origin_forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { phygitalToken?: string; pk?: string; s?: string; c?: string; n?: string };
  if (!body.phygitalToken || !body.pk || !body.s || body.c === undefined || !body.n) {
    return Response.json({ error: "Missing tap params", code: "invalid_proof" }, { status: 400 });
  }
  try {
    const { phygitalToken } = await verifyDynamicConnectProof(
      { pk: body.pk, s: body.s, c: body.c, n: body.n },
      {
        rpc,
        expectedPhygitalToken: body.phygitalToken,
        consumeCounter: ({ identifier, counter }) =>
          counters.consume("tap", identifier, counter),
      },
    );
    return mint(phygitalToken, origin);
  } catch (err) {
    return proofErr(err);
  }
}

/** Shared bearer gate for /preview and /sign. */
async function requireBearer(req: Request): Promise<VerifierBearerPayload | Response> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization")?.trim() ?? "");
  const token = m?.[1]?.trim();
  if (!token) {
    return Response.json({ error: "Connect this item", code: "connect_required" }, { status: 401 });
  }
  const payload = await verifyVerifierBearer(token, {
    decodeVerifierKey: (iss) => {
      try {
        const b = new Uint8Array(base58.encode(iss));
        return b.length === 32 ? b : null;
      } catch {
        return null;
      }
    },
    // On-chain check: is `iss` the verifier this token is configured to use?
    isAuthorizedVerifier: async ({ sub, iss }) => {
      try {
        return (await tokenVerifier(sub as Address)) === iss;
      } catch {
        return false;
      }
    },
  });
  if (!payload) {
    return Response.json({ error: "Session expired", code: "connect_invalid" }, { status: 401 });
  }
  // Bind the session to the origin that established it.
  if (payload.origin !== normalizeOrigin(req.headers.get("Origin"))) {
    return Response.json({ error: "Wrong origin", code: "origin_mismatch" }, { status: 401 });
  }
  return payload;
}

/** POST /preview — bearer required; token comes from the bearer. */
async function preview(req: Request) {
  const session = await requireBearer(req);
  if (session instanceof Response) return session;

  const { instructions } = (await req.json()) as { instructions?: unknown[] };
  if (!Array.isArray(instructions)) {
    return Response.json(
      { ok: false, code: "invalid_transaction", error: "instructions required", soft: false },
      { status: 400 },
    );
  }
  const result = txPolicy.verify(instructions as never);
  return result.ok
    ? Response.json({ ok: true, intentHash: /* hash(instructions) */ "…" })
    : Response.json({ ok: false, code: result.code, error: result.message, soft: false }, { status: 200 });
}

/** POST /sign — bearer required PLUS your operation/owner authorization. */
async function sign(req: Request) {
  const session = await requireBearer(req);
  if (session instanceof Response) return session;

  const { transactions } = (await req.json()) as { transactions?: string[] };
  if (!transactions?.length) {
    return Response.json({ error: "transactions required", code: "invalid_transaction" }, { status: 400 });
  }
  // The bearer never authorizes a signature on its own. Enforce your per-tx
  // operation proof / policy / fee checks HERE for session.sub, then co-sign.
  const signatures = await coSign(session.sub, transactions);
  return Response.json({ signatures });
}

// ── router ──────────────────────────────────────────────────────────────────

export async function handle(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "GET" && pathname === "/health") return health();
  if (req.method === "POST" && pathname === "/connect") return connect(req);
  if (req.method === "POST" && pathname === "/connect/tap") return connectTap(req);
  if (req.method === "POST" && pathname === "/preview") return preview(req);
  if (req.method === "POST" && pathname === "/sign") return sign(req);
  return new Response("Not found", { status: 404 });
}

// The Revibase app origin(s) allowed to call /connect/tap. A browser always
// sends Origin on cross-origin requests and cannot forge it; add localhost only
// for local development.
const APP_ORIGINS = new Set(["https://app.revibase.com"]);
function isAppOrigin(origin: string): boolean {
  return APP_ORIGINS.has(normalizeOrigin(origin) ?? "");
}

// Deployment-specific: apply your per-tx operation/owner authorization, then
// co-sign with the verifier key.
declare function coSign(token: string, txs: string[]): Promise<string[]>;
```

## What the SDK handles vs. what you own

| SDK (`phygital-verifier-sdk`) | You implement |
| --- | --- |
| Blockhash freshness, WebAuthn signature + `signCount` parse, tap P-256 verify, token-PDA derivation, bearer format (sign/verify), `ConnectProofError` → status | Ed25519 signing key, atomic monotonic counter store, Solana RPC, on-chain verifier resolution, transaction policy, per-tx operation/owner authorization in `/sign` |

`/preview` and `/sign` take **no** `phygitalToken` in the body — it comes from
the verified bearer (`session.sub`), so a session can only ever act for the
accessory it was minted for.
