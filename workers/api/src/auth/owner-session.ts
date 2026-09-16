/**
 * Owner-session cookie: proves this browser unlocked owner pubkey P.
 */
import type { Context } from "hono";

import { createSignedSessionCookie } from "@/shared/signed-session-cookie";
import { OWNER_SESSION_TTL_MS } from "@/shared/session-ttl";

export const OWNER_SESSION_COOKIE = "revibase_owner_session";

const cookie = createSignedSessionCookie({
  cookieName: OWNER_SESSION_COOKIE,
  ttlMs: OWNER_SESSION_TTL_MS,
});

export type OwnerSession = {
  publicKey: string;
  exp: number;
  jti: string;
};

export function clearOwnerSessionCookie(c: Context): void {
  cookie.clear(c);
}

export async function readOwnerSession(
  c: Context,
  now = Date.now(),
): Promise<OwnerSession | null> {
  const parsed = await cookie.read(c, now);
  if (!parsed) return null;
  return {
    publicKey: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function issueOwnerSessionCookie(
  c: Context,
  publicKey: string,
): Promise<{ expiresAt: number }> {
  return cookie.issue(c, publicKey);
}
