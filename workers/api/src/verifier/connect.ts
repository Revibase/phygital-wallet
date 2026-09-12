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
import {
  ConnectProofError,
  decodeVerifierBearer,
  normalizeOrigin,
} from "phygital-verifier-sdk";
import type { Address } from "@solana/kit";
import { findPhygitalTokenPda } from "phygital-token-sdk";

import { auditMeta, recordAudit } from "@/audit/audit-log";
import { requireRevibaseAppOrigin } from "@/shared/cors";
import { json } from "@/shared/http";
import { VERIFIER_SESSION_TTL_MS } from "@/shared/session-ttl";
import { verifierJsonError } from "@/verifier/errors";
import { tokenSigner, type TokenSignerRpc } from "@/verifier/token-signer";

/** jti of a freshly minted bearer — the connect/preview/sign correlation key. */
function bearerSessionId(accessToken: string): string | null {
  return decodeVerifierBearer(accessToken)?.payload.jti ?? null;
}

export const connectRoutes = new Hono<{ Bindings: Env }>();

function bearerResponse(
  minted: { accessToken: string; expiresAt: number },
  phygitalToken: Address,
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
  phygitalToken: Address,
): Response {
  if (!minted.ok) {
    return json(
      { error: minted.error, code: minted.code },
      { status: minted.status },
    );
  }
  return bearerResponse(minted, phygitalToken);
}

connectRoutes.post("/connect", async (c) => {
  const started = Date.now();
  const meta = auditMeta(c);
  let phygitalToken: Address | null = null;
  try {
    const body = (await c.req.json()) as {
      blockhash?: string;
      response?: unknown;
    };
    const blockhash = (body.blockhash ?? "").trim();
    const response = body.response as { id?: unknown } | undefined;
    if (!blockhash) {
      throw new ConnectProofError("invalid_proof", "blockhash is required");
    }
    if (typeof response?.id !== "string" || !response.id.trim()) {
      throw new ConnectProofError("invalid_proof", "response.id is required");
    }
    // response.id is the accessory's own WebAuthn credential (the chip), not a
    // person's passkey — the token PDA is derived from it, so phygitalToken
    // already carries this identity. Actor is the accessory; no credential_id.
    phygitalToken = await findPhygitalTokenPda(response.id);
    const minted = await tokenSigner(
      c.env,
      String(phygitalToken),
    ).verifyWebAuthnConnectAndMintBearer({
      blockhash,
      response: body.response,
      origin: normalizeOrigin(c.req.header("Origin")),
      ttlMs: VERIFIER_SESSION_TTL_MS,
    });
    recordAudit({
      event: "connect",
      phygitalToken: String(phygitalToken),
      ok: minted.ok,
      code: minted.ok ? null : minted.code,
      actor: "accessory",
      sessionId: minted.ok ? bearerSessionId(minted.accessToken) : null,
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return bearerResultResponse(minted, phygitalToken);
  } catch (err) {
    recordAudit({
      event: "connect",
      phygitalToken: phygitalToken ? String(phygitalToken) : null,
      ok: false,
      code: "exception",
      actor: "accessory",
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return verifierJsonError(err);
  }
});

connectRoutes.post("/connect/tap", async (c) => {
  const started = Date.now();
  const meta = auditMeta(c);
  let phygitalToken: Address | null = null;
  try {
    const forbidden = requireRevibaseAppOrigin(c);
    if (forbidden) return forbidden;

    const body = (await c.req.json()) as {
      phygitalToken?: Address;
      pk?: string;
      s?: string;
      c?: string | number;
      n?: string;
    };
    if (
      !body.phygitalToken ||
      !body.pk ||
      !body.s ||
      body.c === undefined ||
      !body.n
    ) {
      throw new ConnectProofError("invalid_proof", "Missing tap parameters");
    }
    phygitalToken = body.phygitalToken;

    const minted = await tokenSigner(
      c.env,
      String(body.phygitalToken),
    ).verifyDynamicConnectAndMintBearer({
      pk: body.pk,
      s: body.s,
      c: body.c,
      n: body.n,
      origin: normalizeOrigin(c.req.header("Origin")),
      ttlMs: VERIFIER_SESSION_TTL_MS,
    });
    recordAudit({
      event: "connect_tap",
      phygitalToken: String(body.phygitalToken),
      ok: minted.ok,
      code: minted.ok ? null : minted.code,
      actor: "accessory",
      sessionId: minted.ok ? bearerSessionId(minted.accessToken) : null,
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return bearerResultResponse(minted, body.phygitalToken);
  } catch (err) {
    recordAudit({
      event: "connect_tap",
      phygitalToken: phygitalToken ? String(phygitalToken) : null,
      ok: false,
      code: "exception",
      actor: "accessory",
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return verifierJsonError(err);
  }
});
