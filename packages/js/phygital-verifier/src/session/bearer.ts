/**
 * Verifier session bearer — an asymmetric, on-chain-rooted capability token.
 *
 * A verifier signs a short-lived bearer with its Ed25519 key (the same identity
 * recorded on-chain in `TokenVerifier.verifier` / `Config.verifiers`). Anyone —
 * the issuing verifier, or a *different* service validating a third party's
 * bearer — can verify it from on-chain data alone, with no shared secret.
 *
 * Token = `base64url(payloadJson) . base64url(signature)`, where the signature
 * is Ed25519 over `DOMAIN_TAG ‖ payloadBytes`. The domain tag keeps a bearer
 * signature from ever colliding with a Solana transaction signature, so reusing
 * the verifier's co-signing key here is safe.
 *
 * Signing is injected (`sign`) so the private key never enters this package.
 * Verification resolves the token's configured verifier via an injected
 * callback, so this package needs no RPC or base58 — only `ed25519.verify`.
 */
import { ed25519 } from "@noble/curves/ed25519.js";

import { base64UrlDecode, base64UrlEncode } from "../util/encoding.js";

const DOMAIN_TAG = new TextEncoder().encode("revibase-verifier-session:v1");
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export type VerifierBearerPayload = {
  /** Phygital token PDA (base58). */
  sub: string;
  /** Verifier identity — Ed25519 pubkey as a base58 Solana address. */
  iss: string;
  /** Canonical request origin that established the session, or null for servers. */
  origin: string | null;
  /** Expiry, ms since epoch. */
  exp: number;
  /** Random per-token id. */
  jti: string;
};

export function normalizeOrigin(
  origin: string | null | undefined,
): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

/**
 * Decode `iss` (a base58 address) to its 32-byte Ed25519 public key, or `null`
 * if it is malformed. Must be **pure** — it runs before the signature check so
 * a forged bearer costs no I/O. Injected because this package carries no base58.
 */
export type DecodeVerifierKey = (iss: string) => Uint8Array | null;

/**
 * Is `iss` an authorized verifier for `sub`? Injected by the caller, which owns
 * the on-chain policy: a `TokenVerifier` override names one verifier, while a
 * token on the Config defaults accepts **any** active `Config.verifiers` entry —
 * so this is a membership test, not equality against a single address.
 *
 * Runs only after the signature verifies, so unsigned traffic cannot drive
 * on-chain lookups.
 */
export type IsAuthorizedVerifier = (args: {
  sub: string;
  iss: string;
}) => Promise<boolean> | boolean;

function signingMessage(payloadBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(DOMAIN_TAG.length + payloadBytes.length);
  out.set(DOMAIN_TAG, 0);
  out.set(payloadBytes, DOMAIN_TAG.length);
  return out;
}

/**
 * Mint a verifier bearer. `sign` performs the Ed25519 signature with the
 * verifier's private key (e.g. inside the signing service), so the key never
 * reaches this package.
 */
export async function signVerifierBearer(
  fields: {
    sub: string;
    iss: string;
    origin: string | null;
    ttlMs: number;
  },
  sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>,
  now = Date.now(),
): Promise<{ accessToken: string; expiresAt: number }> {
  const exp = now + fields.ttlMs;
  const payload: VerifierBearerPayload = {
    sub: fields.sub,
    iss: fields.iss,
    origin: fields.origin,
    exp,
    jti: crypto.randomUUID(),
  };
  const payloadBytes = utf8.encode(JSON.stringify(payload));
  const signature = await sign(signingMessage(payloadBytes));
  const accessToken = `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(
    signature,
  )}`;
  return { accessToken, expiresAt: exp };
}

/**
 * Verify a verifier bearer against the token's on-chain verifier policy.
 * Returns the payload when valid, else `null`.
 *
 * Order is deliberate — structure, expiry, signature (all pure), *then* the
 * on-chain authorization check. An invalid or forged bearer is rejected without
 * any I/O, so these open endpoints cannot be used to amplify RPC load.
 */
export async function verifyVerifierBearer(
  token: string | undefined,
  opts: {
    decodeVerifierKey: DecodeVerifierKey;
    isAuthorizedVerifier: IsAuthorizedVerifier;
  },
): Promise<VerifierBearerPayload | null> {
  if (!token) return null;
  const result = decodeVerifierBearer(token);
  if (!result) return null;
  const { payload, payloadBytes, signature } = result;

  const publicKey = opts.decodeVerifierKey(payload.iss);
  if (!publicKey) return null;

  // Signature first (pure), so forged bearers never reach the chain.
  if (!ed25519.verify(signature, signingMessage(payloadBytes), publicKey)) {
    return null;
  }

  const authorized = await opts.isAuthorizedVerifier({
    sub: payload.sub,
    iss: payload.iss,
  });
  return authorized ? payload : null;
}

export function decodeVerifierBearer(token: string): {
  payload: VerifierBearerPayload;
  payloadBytes: Uint8Array;
  signature: Uint8Array;
} | null {
  const now = Date.now();
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  try {
    const payloadBytes = base64UrlDecode(token.slice(0, dot));
    const signature = base64UrlDecode(token.slice(dot + 1));
    const payload = JSON.parse(
      fromUtf8.decode(payloadBytes),
    ) as VerifierBearerPayload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.iss !== "string" ||
      (typeof payload.origin !== "string" && payload.origin !== null) ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= now
    ) {
      return null;
    }
    return { payload, payloadBytes, signature };
  } catch {
    return null;
  }
}
