/**
 * Short-lived possession proof from verify-tap / Hold — not the app session.
 * Bound to chip `identifier` (NFC URL `pk`); used for POST /auth/device/links.
 */
import { base64UrlToBytes, bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

const POSSESSION_TTL_MS = 5 * 60 * 1000;
const USED_PREFIX = "possession:used:";

function requireSecret(): string {
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

export async function mintPossessionToken(args: {
  identifier: string;
  now?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const now = args.now ?? Date.now();
  const exp = now + POSSESSION_TTL_MS;
  const jti = crypto.randomUUID();
  const payload = `${args.identifier.trim()}|${exp}|${jti}`;
  const mac = await hmacSha256(requireSecret(), payload);
  const token = `${bytesToBase64Url(new TextEncoder().encode(payload))}.${bytesToBase64Url(mac)}`;
  return { token, expiresAt: exp };
}

export type PossessionProof = {
  identifier: string;
  exp: number;
  jti: string;
};

export async function parsePossessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<PossessionProof | null> {
  if (!token) return null;
  const [payloadB64, macB64] = token.split(".");
  if (!payloadB64 || !macB64) return null;
  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const expectedMac = await hmacSha256(requireSecret(), payload);
    const actualMac = base64UrlToBytes(macB64);
    if (!timingSafeEqual(expectedMac, actualMac)) return null;
    const [identifier, expStr, jti] = payload.split("|");
    const exp = Number(expStr);
    if (!identifier || !jti || !Number.isFinite(exp)) return null;
    if (exp <= now) return null;
    return { identifier, exp, jti };
  } catch {
    return null;
  }
}

/** Consume once — returns proof or null if invalid/used/expired. */
export async function consumePossessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<PossessionProof | null> {
  const proof = await parsePossessionToken(token, now);
  if (!proof) return null;
  const kv = getEnv().revibase_counter;
  const key = `${USED_PREFIX}${proof.jti}`;
  const used = await kv.get(key);
  if (used) return null;
  const ttlSec = Math.max(1, Math.ceil((proof.exp - now) / 1000));
  await kv.put(key, "1", { expirationTtl: ttlSec });
  return proof;
}
