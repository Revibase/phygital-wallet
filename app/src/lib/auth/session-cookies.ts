/**
 * Edge-safe HMAC verification for API browse-unlock cookies.
 * Must stay in sync with workers/api `session-hmac` + cookie payloads.
 */

import { base64UrlToBytes } from "@/lib/crypto/base64";

export const BROWSE_UNLOCK_COOKIE = "revibase_browse_unlock";

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

async function hmacSha256(
  secret: string,
  payload: string,
): Promise<Uint8Array> {
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

/** True when browse-unlock cookie is valid for this phygital token PDA. */
export async function canAccessPhygitalToken(args: {
  phygitalToken: string;
  browseUnlockCookie?: string;
  secret: string;
  now?: number;
}): Promise<boolean> {
  const browse = await verifyBrowseUnlockCookie(
    args.browseUnlockCookie,
    args.secret,
    args.now ?? Date.now(),
  );
  return Boolean(browse && browse.phygitalToken === args.phygitalToken);
}
