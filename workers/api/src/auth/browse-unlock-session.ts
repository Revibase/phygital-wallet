/**
 * Short-lived browse-unlock cookie after NFC tap / accessory Hold.
 * Not the app login session (`revibase_device_session`).
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { sessionCookieAttrsForRequest } from "@/auth/session-cookie-attrs";
import {
  mintSignedSessionToken,
  parseSignedSessionToken,
} from "@/auth/session-hmac";
import { VERIFIER_SESSION_TTL_MS } from "@/shared/session-ttl";

const BROWSE_UNLOCK_COOKIE = "revibase_browse_unlock";

export type BrowseUnlock = {
  phygitalToken: string;
  exp: number;
  jti: string;
};

function setBrowseUnlockCookie(
  c: Context,
  token: string,
  expiresAt: number,
): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
  setCookie(c, BROWSE_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  });
}

export function clearBrowseUnlockCookie(c: Context): void {
  const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
  deleteCookie(c, BROWSE_UNLOCK_COOKIE, {
    path: "/",
    secure,
    sameSite,
    ...(domain ? { domain } : {}),
  });
}

export async function readBrowseUnlock(
  c: Context,
  now = Date.now(),
): Promise<BrowseUnlock | null> {
  const parsed = await parseSignedSessionToken(
    getCookie(c, BROWSE_UNLOCK_COOKIE),
    now,
  );
  if (!parsed) return null;
  return {
    phygitalToken: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

/** Mint + Set-Cookie for a resolved phygital token PDA. */
export async function issueBrowseUnlockCookie(
  c: Context,
  phygitalToken: string,
): Promise<{ expiresAt: number }> {
  const { token, expiresAt } = await mintSignedSessionToken(
    phygitalToken.trim(),
    VERIFIER_SESSION_TTL_MS,
  );
  setBrowseUnlockCookie(c, token, expiresAt);
  return { expiresAt };
}
