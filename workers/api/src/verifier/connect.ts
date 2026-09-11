/**
 * Connect — exchange a tap proof for a short-lived verifier session bearer.
 *
 * Split by proof type so each route's validation is single-purpose:
 *
 * - `POST /connect`      WebAuthn-over-blockhash. The **portable contract**: open
 *                        CORS, callable by the Revibase app and third-party
 *                        sites, and the shape every verifier implements.
 * - `POST /connect/tap`  Dynamic NFC URL (`pk`/`s`/`c`/`n`). Also part of the
 *                        contract — a token configured to a third-party verifier
 *                        entered via NFC needs *that* verifier's bearer — but in
 *                        practice only the Revibase app calls it, so we scope it
 *                        to app origins.
 *
 * Neither route sets a cookie: the `browse_unlock` app-session cookie is minted
 * only by `POST /auth/app-session`, which exchanges a bearer for it.
 */
import { Hono } from "hono";
import { ConnectProofError, normalizeOrigin } from "phygital-verifier-sdk";
import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";
import { findPhygitalTokenPda } from "phygital-token-sdk";

import { denyIfAuthRateLimited } from "@/auth/rate-limit";
import { requireRevibaseAppOrigin } from "@/shared/cors";
import { json } from "@/shared/http";
import { VERIFIER_SESSION_TTL_MS } from "@/shared/session-ttl";
import { verifierJsonError } from "@/verifier/errors";
import { tokenSigner, type TokenSignerRpc } from "@/verifier/token-signer";
import {
  createRpc,
  resolveAuthorizedVerifiers,
  resolveTokenFromIdentifier,
} from "@/verifier/verifier-keys";

export const connectRoutes = new Hono<{ Bindings: Env }>();

/**
 * Resolve the verifier set the token authorizes. The TokenSigner DO selects the
 * matching signing key when it atomically consumes the proof and mints a bearer.
 */
async function resolveBearerVerifiers(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address
): Promise<readonly string[] | Response> {
  const authorized = await resolveAuthorizedVerifiers(rpc, phygitalToken);
  if (authorized.size === 0) {
    return json(
      { error: "No verifier configured for this item", code: "no_verifier" },
      { status: 409 }
    );
  }
  return [...authorized];
}

function bearerResponse(
  minted: { accessToken: string; expiresAt: number },
  phygitalToken: Address
): Response {
  return json({
    accessToken: minted.accessToken,
    tokenType: "Bearer",
    expiresAt: minted.expiresAt,
    expiresIn: Math.max(0, Math.floor((minted.expiresAt - Date.now()) / 1000)),
    phygitalToken: String(phygitalToken),
  });
}

function bearerResultResponse(
  minted: Awaited<
    ReturnType<TokenSignerRpc["verifyWebAuthnConnectAndMintBearer"]>
  >,
  phygitalToken: Address
): Response {
  if (!minted.ok) {
    // The DO carries the right status (ConnectProofError's own, or 403 for a
    // verifier mismatch), so there is no second code→status table here.
    return json(
      { error: minted.error, code: minted.code },
      { status: minted.status }
    );
  }
  return bearerResponse(minted, phygitalToken);
}

/** WebAuthn-over-slotHash connect — the portable contract. */
connectRoutes.post("/connect", async (c) => {
  try {
    const limited = await denyIfAuthRateLimited(c, "connect");
    if (limited) return limited;

    const body = (await c.req.json()) as {
      blockhash?: string;
      response?: unknown;
    };

    const rpc = createRpc();
    const response = body.response as { id?: unknown } | undefined;
    if (typeof response?.id !== "string" || !response.id.trim()) {
      throw new ConnectProofError("invalid_proof", "response.id is required");
    }
    const phygitalToken = await findPhygitalTokenPda(response.id);

    const authorized = await resolveBearerVerifiers(rpc, phygitalToken);
    if (authorized instanceof Response) return authorized;
    const minted = await tokenSigner(
      c.env,
      String(phygitalToken)
    ).verifyWebAuthnConnectAndMintBearer({
      blockhash: body.blockhash as string,
      response: body.response,
      origin: normalizeOrigin(c.req.header("Origin")),
      verifiers: authorized,
      ttlMs: VERIFIER_SESSION_TTL_MS,
    });
    return bearerResultResponse(minted, phygitalToken);
  } catch (err) {
    return verifierJsonError(err);
  }
});

/** Dynamic NFC URL connect — Revibase app origins only. */
connectRoutes.post("/connect/tap", async (c) => {
  try {
    const forbidden = requireRevibaseAppOrigin(c);
    if (forbidden) return forbidden;

    const limited = await denyIfAuthRateLimited(c, "connect-tap");
    if (limited) return limited;

    const body = (await c.req.json()) as {
      pk?: string;
      s?: string;
      c?: string | number;
      n?: string;
    };
    if (!body.pk || !body.s || body.c === undefined || !body.n) {
      throw new ConnectProofError("invalid_proof", "Missing tap parameters");
    }

    const rpc = createRpc();
    const phygitalToken = await resolveTokenFromIdentifier(rpc, body.pk);
    if (!phygitalToken) {
      throw new ConnectProofError(
        "token_not_found",
        "No phygital token for this accessory"
      );
    }
    const authorized = await resolveBearerVerifiers(rpc, phygitalToken);
    if (authorized instanceof Response) return authorized;
    const minted = await tokenSigner(
      c.env,
      String(phygitalToken)
    ).verifyDynamicConnectAndMintBearer({
      pk: body.pk,
      s: body.s,
      c: body.c,
      n: body.n,
      origin: normalizeOrigin(c.req.header("Origin")),
      verifiers: authorized,
      ttlMs: VERIFIER_SESSION_TTL_MS,
    });
    return bearerResultResponse(minted, phygitalToken);
  } catch (err) {
    return verifierJsonError(err);
  }
});
