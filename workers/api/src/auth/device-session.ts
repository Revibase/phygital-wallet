import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { base64UrlToBytes, bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

const DEVICE_COOKIE = "revibase_device_session";
const DEVICE_SESSION_TTL_MS = 30 * 60 * 1000;

export type DeviceSession = {
  credentialId: string;
  exp: number;
  jti: string;
};

function requireSessionSecret(): string {
  const secret = getEnv().POLICY_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("POLICY_SESSION_SECRET is not configured");
  }
  return secret;
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function mintDeviceSessionToken(args: {
  credentialId: string;
  now?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const now = args.now ?? Date.now();
  const exp = now + DEVICE_SESSION_TTL_MS;
  const jti = crypto.randomUUID();
  const payload = `${args.credentialId}|${exp}|${jti}`;
  const mac = await hmacSha256(requireSessionSecret(), payload);
  const token = `${bytesToBase64Url(new TextEncoder().encode(payload))}.${bytesToBase64Url(mac)}`;
  return { token, expiresAt: exp };
}

async function parseDeviceSessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<DeviceSession | null> {
  if (!token) return null;
  const [payloadB64, macB64] = token.split(".");
  if (!payloadB64 || !macB64) return null;
  try {
    const payloadBytes = base64UrlToBytes(payloadB64);
    const payload = new TextDecoder().decode(payloadBytes);
    const expectedMac = await hmacSha256(requireSessionSecret(), payload);
    const actualMac = base64UrlToBytes(macB64);
    if (!timingSafeEqual(expectedMac, actualMac)) return null;
    const [credentialId, expStr, jti] = payload.split("|");
    const exp = Number(expStr);
    if (!credentialId || !jti || !Number.isFinite(exp)) return null;
    if (exp <= now) return null;
    return { credentialId, exp, jti };
  } catch {
    return null;
  }
}

function cookieAttrsForRequest(c: Context): {
  secure: boolean;
  sameSite: "None" | "Lax";
} {
  try {
    const url = new URL(c.req.url);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (localHttp) return { secure: false, sameSite: "Lax" };
  } catch {
    /* fall through */
  }
  return { secure: true, sameSite: "None" };
}

export function setDeviceSessionCookie(
  c: Context,
  token: string,
  expiresAt: number,
): void {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const { secure, sameSite } = cookieAttrsForRequest(c);
  setCookie(c, DEVICE_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge,
  });
}

export async function readDeviceSession(
  c: Context,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const raw = getCookie(c, DEVICE_COOKIE);
  return parseDeviceSessionToken(raw, now);
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
