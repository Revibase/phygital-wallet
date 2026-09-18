/**
 * Short-lived browse-unlock cookie after NFC tap / accessory Hold.
 */
import type { Context } from "hono";

import { clearOwnerBrowseCookie } from "@/auth/owner-browse-session";
import { createSignedSessionCookie } from "@/shared/signed-session-cookie";
import { BROWSE_SESSION_TTL_MS } from "@/shared/session-ttl";

const BROWSE_UNLOCK_COOKIE = "revibase_browse_unlock";

const cookie = createSignedSessionCookie({
  cookieName: BROWSE_UNLOCK_COOKIE,
  ttlMs: BROWSE_SESSION_TTL_MS,
});

export type BrowseUnlock = {
  phygitalToken: string;
  exp: number;
  jti: string;
};

export function clearBrowseUnlockCookie(c: Context): void {
  cookie.clear(c);
}

export async function readBrowseUnlock(
  c: Context,
  now = Date.now(),
): Promise<BrowseUnlock | null> {
  const parsed = await cookie.read(c, now);
  if (!parsed) return null;
  return {
    phygitalToken: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function issueBrowseUnlockCookie(
  c: Context,
  phygitalToken: string,
): Promise<{ expiresAt: number }> {
  // Physical tap / Hold always wins over leftover owner-browse.
  clearOwnerBrowseCookie(c);
  return cookie.issue(c, phygitalToken);
}
