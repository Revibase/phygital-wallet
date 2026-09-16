/**
 * Per-item owner-browse cookie: admits `/token/:pda` without NFC Hold.
 */
import type { Context } from "hono";

import { createSignedSessionCookie } from "@/shared/signed-session-cookie";
import { VERIFIER_SESSION_TTL_MS } from "@/shared/session-ttl";

export const OWNER_BROWSE_COOKIE = "revibase_owner_browse";

const cookie = createSignedSessionCookie({
  cookieName: OWNER_BROWSE_COOKIE,
  ttlMs: VERIFIER_SESSION_TTL_MS,
});

export type OwnerBrowse = {
  phygitalToken: string;
  exp: number;
  jti: string;
};

export function clearOwnerBrowseCookie(c: Context): void {
  cookie.clear(c);
}

export async function readOwnerBrowse(
  c: Context,
  now = Date.now(),
): Promise<OwnerBrowse | null> {
  const parsed = await cookie.read(c, now);
  if (!parsed) return null;
  return {
    phygitalToken: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function issueOwnerBrowseCookie(
  c: Context,
  phygitalToken: string,
): Promise<{ expiresAt: number }> {
  return cookie.issue(c, phygitalToken);
}
