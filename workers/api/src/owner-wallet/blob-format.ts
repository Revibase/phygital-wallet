/**
 * Minimal SSW1 header parse for the API worker.
 * Full crypto stays in secure-signer; we only need pubkey + credentialId to
 * key the D1 backup and reject malformed uploads.
 */

export const MAX_OWNER_BLOB_BYTES = 1024;
export const MAX_CREDENTIAL_ID_BYTES = 256;
const EXPECTED_CT = 48;
const MAGIC = [0x53, 0x53, 0x57, 0x31]; // SSW1

export class OwnerBlobParseError extends Error {
  constructor(message = "invalid_wallet_blob") {
    super(message);
    this.name = "OwnerBlobParseError";
  }
}

export type OwnerBlobHeader = {
  version: number;
  publicKey: Uint8Array;
  credentialId: Uint8Array;
  raw: Uint8Array;
};

function u16(b: Uint8Array, o: number): number {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0;
}

/** Decode base64url (no padding required). */
export function base64UrlToBytes(input: string, maxBytes: number): Uint8Array {
  if (typeof input !== "string" || input.length === 0) {
    throw new OwnerBlobParseError("empty");
  }
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(pad);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new OwnerBlobParseError("bad_base64");
  }
  if (bin.length > maxBytes) throw new OwnerBlobParseError("too_large");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseOwnerBlobHeader(raw: Uint8Array): OwnerBlobHeader {
  const min =
    4 + 1 + 32 + 2 + 1 + 32 + 12 + 2 + EXPECTED_CT;
  if (raw.length < min || raw.length > MAX_OWNER_BLOB_BYTES) {
    throw new OwnerBlobParseError("size");
  }
  for (let i = 0; i < 4; i++) {
    if (raw[i] !== MAGIC[i]) throw new OwnerBlobParseError("magic");
  }
  const version = raw[4]!;
  if (version !== 1) throw new OwnerBlobParseError("version");
  const publicKey = raw.subarray(5, 37);
  const credLen = u16(raw, 37);
  if (credLen < 1 || credLen > MAX_CREDENTIAL_ID_BYTES) {
    throw new OwnerBlobParseError("cred_len");
  }
  let o = 39;
  const credentialId = raw.subarray(o, o + credLen);
  o += credLen;
  o += 32; // kdfSalt
  o += 12; // iv
  if (o + 2 > raw.length) throw new OwnerBlobParseError("truncated");
  const ctLen = u16(raw, o);
  o += 2;
  if (ctLen !== EXPECTED_CT || o + ctLen !== raw.length) {
    throw new OwnerBlobParseError("ciphertext");
  }
  return {
    version,
    publicKey: publicKey.slice(),
    credentialId: credentialId.slice(),
    raw,
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource),
  );
  let s = "";
  for (const b of digest) s += b.toString(16).padStart(2, "0");
  return s;
}

const CRED_HASH_RE = /^[a-f0-9]{64}$/;

export function isCredentialIdHash(value: string): boolean {
  return CRED_HASH_RE.test(value);
}
