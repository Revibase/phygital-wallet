/**
 * Shared HMAC helpers for device-session + browse-unlock cookies.
 */
import { base64UrlToBytes, bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

/** Per-isolate CryptoKey cache — secret is stable for the Worker lifetime. */
const hmacKeyBySecret = new Map<string, Promise<CryptoKey>>();

export function requireSessionSecret(): string {
  const secret = getEnv().POLICY_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("POLICY_SESSION_SECRET is not configured");
  }
  return secret;
}

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

export async function hmacSha256(
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

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Mint `payload|exp|jti` + HMAC token. */
export async function mintSignedSessionToken(
  payloadHead: string,
  ttlMs: number,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const exp = now + ttlMs;
  const jti = crypto.randomUUID();
  const payload = `${payloadHead}|${exp}|${jti}`;
  const mac = await hmacSha256(requireSessionSecret(), payload);
  const token = `${bytesToBase64Url(new TextEncoder().encode(payload))}.${bytesToBase64Url(mac)}`;
  return { token, expiresAt: exp };
}

/** Parse signed session token into payload parts (before `|exp|jti` split). */
export async function parseSignedSessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<{ head: string; exp: number; jti: string } | null> {
  if (!token) return null;
  const [payloadB64, macB64] = token.split(".");
  if (!payloadB64 || !macB64) return null;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const expectedMac = await hmacSha256(requireSessionSecret(), payload);
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
