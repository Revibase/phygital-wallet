/**
 * Factory for httpOnly HMAC session cookies (`head|exp|jti` payload).
 * Browse-unlock, owner-browse, and owner-session share this shell.
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { sessionCookieAttrsForRequest } from "@/auth/session-cookie-attrs";
import {
  mintSignedSessionToken,
  parseSignedSessionToken,
} from "@/auth/session-hmac";

export type SignedSessionPayload = {
  head: string;
  exp: number;
  jti: string;
};

export function createSignedSessionCookie(opts: {
  cookieName: string;
  ttlMs: number;
}) {
  const { cookieName, ttlMs } = opts;

  function set(c: Context, token: string, expiresAt: number): void {
    const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
    setCookie(c, cookieName, token, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge,
      ...(domain ? { domain } : {}),
    });
  }

  function clear(c: Context): void {
    const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
    deleteCookie(c, cookieName, {
      path: "/",
      secure,
      sameSite,
      ...(domain ? { domain } : {}),
    });
  }

  async function read(
    c: Context,
    now = Date.now(),
  ): Promise<SignedSessionPayload | null> {
    const parsed = await parseSignedSessionToken(getCookie(c, cookieName), now);
    if (!parsed) return null;
    return { head: parsed.head, exp: parsed.exp, jti: parsed.jti };
  }

  async function issue(
    c: Context,
    head: string,
  ): Promise<{ expiresAt: number }> {
    const { token, expiresAt } = await mintSignedSessionToken(
      head.trim(),
      ttlMs,
    );
    set(c, token, expiresAt);
    return { expiresAt };
  }

  return { clear, read, issue };
}
