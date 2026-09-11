/**
 * Bearer auth for the verifier API (`/preview`, `/sign`) and the app-session
 * exchange.
 *
 * The bearer is also where the phygital token comes from: callers do not pass one,
 * so a session can only ever act for the accessory it was minted for and there is
 * no client-supplied token to disagree with.
 *
 * These endpoints are **bearer-only** — they never accept the `browse_unlock`
 * cookie, so auth is identical no matter who the caller is. The bearer proves a
 * recent tap; it never authorizes a signature on its own: `/sign` still requires
 * the operation proof embedded in the transaction (or owner cosign for config).
 */
import type { Context } from "hono";
import {
  normalizeOrigin,
  verifyVerifierBearer,
  type VerifierBearerPayload,
} from "phygital-verifier-sdk";

import { getDefaultVerifierSet } from "@/fees/default-verifier";
import { json } from "@/shared/http";
import { getBase58Encoder } from "@solana/kit";

function unauthorized(code: string, error: string): Response {
  return json({ error, code }, { status: 401 });
}

/**
 * Verify the request's `Authorization: Bearer` against the token's on-chain
 * verifier set. Returns the payload, or a 401 `Response` to return as-is.
 */
export async function readVerifierBearer(
  c: Context<{ Bindings: Env }>
): Promise<VerifierBearerPayload | Response> {
  const header = c.req.header("Authorization")?.trim();
  const token = header ? /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() : null;
  if (!token) {
    return unauthorized("connect_required", "Connect this item to continue.");
  }

  const payload = await verifyVerifierBearer(token, {
    // Must return null (never throw) on a malformed iss, so a bad bearer is a
    // clean 401 rather than a thrown error the route maps to 400.
    decodeVerifierKey: (iss) => {
      try {
        const bytes = new Uint8Array(getBase58Encoder().encode(iss));
        return bytes.length === 32 ? bytes : null;
      } catch {
        return null;
      }
    },
    isAuthorizedVerifier: ({ iss }) => getDefaultVerifierSet().has(iss),
  });
  if (!payload) {
    return unauthorized(
      "connect_invalid",
      "Session expired — tap your item again."
    );
  }
  if (payload.origin !== normalizeOrigin(c.req.header("Origin"))) {
    return unauthorized(
      "origin_mismatch",
      "This bearer is bound to a different origin."
    );
  }
  return payload;
}
