/**
 * Owner session + per-item owner browse.
 *
 *   POST /owner-session/challenge  {} → { challengeId, challenge }
 *   POST /owner-session            { challengeId, signature, publicKey }
 *   DELETE /owner-session          — clear owner_session (+ owner_browse)
 *   POST /accessory/owner-browse   { phygitalToken } — requires owner_session
 *   GET  /accessory/session        → { mode, phygitalToken }
 */
import { Hono } from "hono";
import {
  address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";
import {
  fetchMaybeAuthority,
  findAuthorityAccountPda,
} from "phygital-wallet-sdk";

import {
  clearBrowseUnlockCookie,
  readBrowseUnlock,
} from "@/auth/browse-unlock-session";
import {
  clearOwnerBrowseCookie,
  issueOwnerBrowseCookie,
  readOwnerBrowse,
} from "@/auth/owner-browse-session";
import {
  consumeOwnerSessionChallenge,
  issueOwnerSessionChallenge,
  ownerSessionChallengeMessage,
} from "@/auth/owner-session-challenge";
import {
  clearOwnerSessionCookie,
  issueOwnerSessionCookie,
  readOwnerSession,
} from "@/auth/owner-session";
import { verifyConsumedChallengeProof } from "@/auth/possession-proof";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
import { tryParseAddress } from "@/shared/solana/address";
import { getRpcUrl } from "@/shared/solana/cluster";

export const ownerSessionRoutes = new Hono<{ Bindings: Env }>();

const encodeAddress = getAddressEncoder();

/** POST /owner-session/challenge */
ownerSessionRoutes.post("/owner-session/challenge", async () => {
  const issued = await issueOwnerSessionChallenge();
  return json(issued);
});

/**
 * POST /owner-session — mint cookie after ed25519 proof over session challenge.
 * Signature domain: `revibase.owner-session.v1 || challengeBytes`.
 */
ownerSessionRoutes.post("/owner-session", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const publicKeyRaw = record["publicKey"];
  const challengeId =
    typeof record["challengeId"] === "string"
      ? record["challengeId"].trim()
      : "";
  const signatureB64 =
    typeof record["signature"] === "string"
      ? record["signature"].trim()
      : "";

  if (!challengeId || !signatureB64) {
    return json(
      {
        error: "challengeId and signature are required",
        code: "proof_required",
      },
      { status: 401 },
    );
  }
  if (typeof publicKeyRaw !== "string" || !tryParseAddress(publicKeyRaw)) {
    return json(
      {
        error: "publicKey must be a valid Solana address",
        code: "invalid_public_key",
      },
      { status: 400 },
    );
  }
  const publicKey = publicKeyRaw.trim();

  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = new Uint8Array(encodeAddress.encode(address(publicKey)));
  } catch {
    return json(
      { error: "Invalid proof", code: "invalid_proof" },
      { status: 400 },
    );
  }

  const proof = await verifyConsumedChallengeProof({
    challengeId,
    signatureB64,
    publicKeyBytes: pubkeyBytes,
    consume: consumeOwnerSessionChallenge,
    buildMessage: ownerSessionChallengeMessage,
    expiredError: "This unlock request expired. Try again.",
  });
  if (!proof.ok) {
    return json(
      { error: proof.error, code: proof.code },
      { status: proof.status },
    );
  }

  const { expiresAt } = await issueOwnerSessionCookie(c, publicKey);
  return json({ ok: true, publicKey, expiresAt });
});

/** DELETE /owner-session — logout clears owner cookies. */
ownerSessionRoutes.delete("/owner-session", async (c) => {
  clearOwnerSessionCookie(c);
  clearOwnerBrowseCookie(c);
  return json({ ok: true });
});

/**
 * POST /accessory/owner-browse — quiet per-item admit.
 * Requires live owner_session; RPC-checks Authority == session pubkey.
 */
ownerSessionRoutes.post("/accessory/owner-browse", async (c) => {
  const session = await readOwnerSession(c);
  if (!session) {
    return json(
      {
        error: "Sign in on this phone to open accessories from Home.",
        code: "owner_session_required",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const phygitalTokenRaw = (body as Record<string, unknown>)["phygitalToken"];
  if (
    typeof phygitalTokenRaw !== "string" ||
    !tryParseAddress(phygitalTokenRaw)
  ) {
    return json(
      {
        error: "phygitalToken must be a valid Solana address",
        code: "invalid_phygital_token",
      },
      { status: 400 },
    );
  }
  const phygitalToken = phygitalTokenRaw.trim();

  const existing = await readOwnerBrowse(c);
  if (existing?.phygitalToken === phygitalToken) {
    clearBrowseUnlockCookie(c);
    return json({
      ok: true,
      mode: "owner" as const,
      phygitalToken,
      expiresAt: existing.exp,
    });
  }

  try {
    const rpc = createSolanaRpc(getRpcUrl());
    const [authorityPda] = await findAuthorityAccountPda({
      phygitalToken: address(phygitalToken),
    });
    const account = await fetchMaybeAuthority(rpc, authorityPda);
    if (!account.exists) {
      return json(
        {
          error: "This accessory has not been claimed yet.",
          code: "not_claimed",
        },
        { status: 403 },
      );
    }
    const onChainAuthority = String(account.data.header.authority);
    if (onChainAuthority !== session.publicKey) {
      return json(
        {
          error: "You are not the owner of this accessory.",
          code: "not_authority",
        },
        { status: 403 },
      );
    }
  } catch (err) {
    return json(
      {
        error: getErrorMessage(err, "Could not verify ownership"),
        code: "authority_lookup_failed",
      },
      { status: 502 },
    );
  }

  // Owner browse wins over leftover accessory cookie for this admit.
  clearBrowseUnlockCookie(c);
  const { expiresAt } = await issueOwnerBrowseCookie(c, phygitalToken);
  return json({
    ok: true,
    mode: "owner" as const,
    phygitalToken,
    expiresAt,
  });
});

/**
 * GET /accessory/session — which admit cookie is live.
 * Physical tap (browse_unlock) wins when both somehow remain.
 */
ownerSessionRoutes.get("/accessory/session", async (c) => {
  const browse = await readBrowseUnlock(c);
  if (browse) {
    return json({
      mode: "accessory" as const,
      phygitalToken: browse.phygitalToken,
      expiresAt: browse.exp,
    });
  }
  const ownerBrowse = await readOwnerBrowse(c);
  if (ownerBrowse) {
    return json({
      mode: "owner" as const,
      phygitalToken: ownerBrowse.phygitalToken,
      expiresAt: ownerBrowse.exp,
    });
  }
  return json({ mode: null, phygitalToken: null });
});
