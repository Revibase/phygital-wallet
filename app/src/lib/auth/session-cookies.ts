/**
 * Edge-safe HMAC verification for API session cookies.
 * Must stay in sync with workers/api `session-hmac` + cookie payloads.
 */

import { base64UrlToBytes } from "@/lib/crypto/base64";

export const DEVICE_SESSION_COOKIE = "revibase_device_session";
export const DEVICE_REFRESH_COOKIE = "revibase_device_refresh";
export const BROWSE_UNLOCK_COOKIE = "revibase_browse_unlock";

const REFRESH_HEAD_PREFIX = "dref|";

export type DeviceSession = {
  credentialId: string;
  exp: number;
  jti: string;
};

export type BrowseUnlock = {
  phygitalToken: string;
  exp: number;
  jti: string;
};

/** Per-isolate CryptoKey cache — avoids re-importKey on every middleware hit. */
const hmacKeyBySecret = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let pending = hmacKeyBySecret.get(secret);
  if (!pending) {
    pending = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    hmacKeyBySecret.set(secret, pending);
  }
  return pending;
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
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

/** Parse `head|…|exp|jti` (head may contain `|`). */
async function parseSignedPayload(
  token: string | undefined,
  secret: string,
  now: number,
): Promise<{ head: string; exp: number; jti: string } | null> {
  if (!token || !secret) return null;
  const [payloadB64, macB64] = token.split(".");
  if (!payloadB64 || !macB64) return null;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const expectedMac = await hmacSha256(secret, payload);
    const actualMac = base64UrlToBytes(macB64);
    if (!timingSafeEqual(expectedMac, actualMac)) return null;
    const parts = payload.split("|");
    if (parts.length < 3) return null;
    const jti = parts[parts.length - 1]!;
    const exp = Number(parts[parts.length - 2]);
    const head = parts.slice(0, -2).join("|");
    if (!head || !jti || !Number.isFinite(exp) || exp <= now) return null;
    return { head, exp, jti };
  } catch {
    return null;
  }
}

export async function verifyDeviceSessionCookie(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const parsed = await parseSignedPayload(token, secret, now);
  if (!parsed || parsed.head.startsWith(REFRESH_HEAD_PREFIX)) return null;
  return {
    credentialId: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function verifyDeviceRefreshCookie(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<DeviceSession | null> {
  const parsed = await parseSignedPayload(token, secret, now);
  if (!parsed?.head.startsWith(REFRESH_HEAD_PREFIX)) return null;
  const credentialId = parsed.head.slice(REFRESH_HEAD_PREFIX.length);
  if (!credentialId) return null;
  return {
    credentialId,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

export async function verifyBrowseUnlockCookie(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<BrowseUnlock | null> {
  const parsed = await parseSignedPayload(token, secret, now);
  if (!parsed) return null;
  return {
    phygitalToken: parsed.head,
    exp: parsed.exp,
    jti: parsed.jti,
  };
}

/**
 * True when a device access or refresh session is present, or browse unlock
 * matches this token. Refresh alone is enough for Next page gating; API calls
 * still need access (client refreshes first).
 */
export async function canAccessTokenWallet(args: {
  phygitalToken: string;
  deviceSessionCookie?: string;
  deviceRefreshCookie?: string;
  browseUnlockCookie?: string;
  secret: string;
  now?: number;
}): Promise<boolean> {
  const now = args.now ?? Date.now();
  // Prefer device access — owners usually have it; avoids a second HMAC.
  if (
    await verifyDeviceSessionCookie(args.deviceSessionCookie, args.secret, now)
  ) {
    return true;
  }
  if (
    await verifyDeviceRefreshCookie(args.deviceRefreshCookie, args.secret, now)
  ) {
    return true;
  }
  const browse = await verifyBrowseUnlockCookie(
    args.browseUnlockCookie,
    args.secret,
    now,
  );
  return Boolean(browse && browse.phygitalToken === args.phygitalToken);
}
