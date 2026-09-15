/**
 * Cryptographic primitives. NO custom primitives (§5, §29): key wrapping uses
 * WebCrypto (HKDF-SHA256 -> AES-256-GCM), Ed25519 uses the audited @noble/curves.
 *
 * The derived AES key is NON-EXTRACTABLE and lives only for the duration of one
 * operation. We cannot guarantee JS memory erasure (§30, §42); `scrub()` best-
 * effort zeroes buffers we own before dropping references, with that caveat.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import {
  AES_GCM_TAG_BITS,
  AES_KEY_BITS,
  ED25519_PUBKEY_BYTES,
  HKDF_INFO_LABEL,
} from "./constants.js";
import { utf8ToBytes } from "./encoding.js";

const subtle = globalThis.crypto.subtle;

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Best-effort zeroing of a buffer we own. NOT a guaranteed memory wipe (§30). */
export function scrub(...buffers: Array<Uint8Array | undefined>): void {
  for (const b of buffers) if (b) b.fill(0);
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

/**
 * HKDF-SHA256(prfOutput, salt, info=HKDF_INFO_LABEL) -> non-extractable AES-256-GCM key.
 * `info` is implementation-fixed (§35) so a swapped blob cannot redirect derivation.
 */
export async function deriveWrappingKey(
  prfOutput: Uint8Array,
  salt: Uint8Array
): Promise<CryptoKey> {
  const base = await subtle.importKey(
    "raw",
    prfOutput as BufferSource,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: utf8ToBytes(HKDF_INFO_LABEL) as BufferSource,
    },
    base,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false, // non-extractable: the raw key bytes never leave WebCrypto.
    ["encrypt", "decrypt"]
  );
}

export async function aesGcmEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: AES_GCM_TAG_BITS },
    key,
    plaintext as BufferSource
  );
  return new Uint8Array(ct);
}

/**
 * AES-GCM decrypt+authenticate. Throws on any authentication failure. Callers
 * map ALL failures to a single generic error (§31) to avoid a decryption oracle.
 */
export async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertextWithTag: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: AES_GCM_TAG_BITS },
    key,
    ciphertextWithTag as BufferSource
  );
  return new Uint8Array(pt);
}

/** Derive the Ed25519 public key (32B) from a 32-byte seed. */
export function ed25519PublicKey(seed: Uint8Array): Uint8Array {
  const pub = ed25519.getPublicKey(seed);
  if (pub.length !== ED25519_PUBKEY_BYTES) throw new Error("bad pubkey length");
  return pub;
}

/** Sign a message with the Ed25519 seed. Returns a 64-byte signature. */
export function ed25519Sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed);
}

/** Generate a fresh 32-byte Ed25519 seed from the CSPRNG (§10 — parent never supplies randomness). */
export function generateEd25519Seed(): Uint8Array {
  return randomBytes(32);
}
