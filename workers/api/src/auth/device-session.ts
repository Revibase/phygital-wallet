import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { sessionCookieAttrsForRequest } from "@/auth/session-cookie-attrs";
import {
  mintSignedSessionToken,
  parseSignedSessionToken,
} from "@/auth/session-hmac";

/** Short-lived access cookie — all protected routes rely on this. */
export const DEVICE_SESSION_COOKIE = "revibase_device_session";
/** Long-lived refresh cookie — only used to mint a new access cookie. */
export const DEVICE_REFRESH_COOKIE = "revibase_device_refresh";

const DEVICE_ACCESS_TTL_MS = 15 * 60 * 1000;
const DEVICE_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Payload head prefix so a refresh token cannot be mistaken for access. */
const REFRESH_HEAD_PREFIX = "dref|";

export type DeviceSession = {
  credentialId: string;
  exp: number;
  jti: string;
};

export async function mintDeviceSessionToken(args: {
  credentialId: string;
  now?: number;
}): Promise<{ token: string; expiresAt: number }> {
  return mintSignedSessionToken(
    args.credentialId,
    DEVICE_ACCESS_TTL_MS,
    args.now,
  );
}

export async function mintDeviceRefreshToken(args: {
  credentialId: string;
  now?: number;
}): Promise<{ token: string; expiresAt: number }> {
  return mintSignedSessionToken(
    `${REFRESH_HEAD_PREFIX}${args.credentialId}`,
    DEVICE_REFRESH_TTL_MS,
    args.now,
  );
}

function setSessionCookie(
  c: Context,
  name: string,
  token: string,
  expiresAt: number,
): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
  setCookie(c, name, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  });
}

export function setDeviceSessionCookie(
  c: Context,
  token: string,
  expiresAt: number,
): void {
  setSessionCookie(c, DEVICE_SESSION_COOKIE, token, expiresAt);
}

export function setDeviceRefreshCookie(
  c: Context,
  token: string,
  expiresAt: number,
): void {
  setSessionCookie(c, DEVICE_REFRESH_COOKIE, token, expiresAt);
}

/** Mint access + refresh and set both cookies. Returns access expiry. */
export async function issueDeviceSessionCookies(
  c: Context,
  credentialId: string,
  now = Date.now(),
): Promise<{ credentialId: string; expiresAt: number }> {
  const access = await mintDeviceSessionToken({ credentialId, now });
  const refresh = await mintDeviceRefreshToken({ credentialId, now });
  setDeviceSessionCookie(c, access.token, access.expiresAt);
  setDeviceRefreshCookie(c, refresh.token, refresh.expiresAt);
  return { credentialId, expiresAt: access.expiresAt };
}

export function clearDeviceSessionCookies(c: Context): void {
  const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
  const attrs = {
    path: "/",
    secure,
    sameSite,
    ...(domain ? { domain } : {}),
  } as const;
  deleteCookie(c, DEVICE_SESSION_COOKIE, attrs);
  deleteCookie(c, DEVICE_REFRESH_COOKIE, attrs);
}

export async function readDeviceSession(
  c: Context,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const parsed = await parseSignedSessionToken(
    getCookie(c, DEVICE_SESSION_COOKIE),
    now,
  );
  if (!parsed) return null;
  // Reject a refresh token placed in the access cookie slot.
  if (parsed.head.startsWith(REFRESH_HEAD_PREFIX)) return null;
  return {
    credentialId: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function readDeviceRefresh(
  c: Context,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const parsed = await parseSignedSessionToken(
    getCookie(c, DEVICE_REFRESH_COOKIE),
    now,
  );
  if (!parsed?.head.startsWith(REFRESH_HEAD_PREFIX)) return null;
  const credentialId = parsed.head.slice(REFRESH_HEAD_PREFIX.length);
  if (!credentialId) return null;
  return {
    credentialId,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

/**
 * Prefer a valid access cookie; otherwise rotate from refresh when present.
 * Used by public session/gate handlers so landing can stay signed-in.
 */
export async function ensureDeviceAccessSession(
  c: Context,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const access = await readDeviceSession(c, now);
  if (access) return access;

  const refresh = await readDeviceRefresh(c, now);
  if (!refresh) return null;

  const issued = await issueDeviceSessionCookies(c, refresh.credentialId, now);
  return {
    credentialId: issued.credentialId,
    exp: issued.expiresAt,
    jti: "",
  };
}

/** Require a valid device **access** cookie (credential-scoped). */
export async function requireDeviceSession(
  c: Context,
): Promise<DeviceSession | Response> {
  const session = await readDeviceSession(c);
  if (!session) {
    return c.json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      401,
    );
  }
  return session;
}
