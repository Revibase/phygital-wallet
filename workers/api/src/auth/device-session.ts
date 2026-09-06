import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { sessionCookieAttrsForRequest } from "@/auth/session-cookie-attrs";
import {
  mintSignedSessionToken,
  parseSignedSessionToken,
} from "@/auth/session-hmac";

export const DEVICE_SESSION_COOKIE = "revibase_device_session";
const DEVICE_SESSION_TTL_MS = 30 * 60 * 1000;

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
    DEVICE_SESSION_TTL_MS,
    args.now,
  );
}

export function setDeviceSessionCookie(
  c: Context,
  token: string,
  expiresAt: number,
): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const { secure, sameSite, domain } = sessionCookieAttrsForRequest(c);
  setCookie(c, DEVICE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  });
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
  return {
    credentialId: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

/** Require a valid device session cookie (credential-scoped). */
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
