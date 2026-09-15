/**
 * Portable encrypted wallet blob: a small, versioned, self-describing DETERMINISTIC
 * BINARY format (§6). Deliberately not free-form JSON so the AES-GCM AAD (§7) is
 * an unambiguous byte string, and so a malicious parent cannot smuggle extra
 * fields or reorder them.
 *
 * The blob is treated as PUBLIC CIPHERTEXT (§4): holding it must not by itself
 * reveal the key. Every cleartext field is bound as AAD, so tampering fails
 * decryption; after decryption we additionally re-derive the public key and
 * require it to match the stored one (§7, §34).
 *
 * Layout (big-endian lengths):
 *   magic[4] "SSW1" | version[1] | publicKey[32] |
 *   credIdLen[u16] | credentialId[credIdLen] |
 *   kdfSalt[32] | iv[12] | ctLen[u16] | ciphertext[ctLen]
 */

import {
  AES_GCM_IV_BYTES,
  BLOB_MAGIC,
  BLOB_VERSION,
  ED25519_PUBKEY_BYTES,
  HKDF_INFO_LABEL,
  KDF_SALT_BYTES,
  MAX_BLOB_BYTES,
  MAX_CREDENTIAL_ID_BYTES,
} from "./constants.js";
import { bytesEqual, utf8ToBytes } from "./encoding.js";

/** seed(32) + GCM tag(16) = fixed 48. Attacker-chosen sizes are rejected. */
export const EXPECTED_CIPHERTEXT_BYTES = 48;

export class BlobError extends Error {}

export interface WalletBlobFields {
  publicKey: Uint8Array; // 32
  credentialId: Uint8Array; // <= MAX_CREDENTIAL_ID_BYTES
  kdfSalt: Uint8Array; // 32
  iv: Uint8Array; // 12
  ciphertext: Uint8Array; // 48
}

export interface ParsedWalletBlob extends WalletBlobFields {
  version: number;
}

// --- bounds-checked reader (no OOB reads on attacker bytes, §38) ---
class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.o + n > this.b.length) throw new BlobError("truncated");
  }
  bytes(n: number): Uint8Array {
    if (n < 0) throw new BlobError("bad length");
    this.need(n);
    const out = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return out;
  }
  u8(): number {
    this.need(1);
    return this.b[this.o++]!;
  }
  u16(): number {
    this.need(2);
    return (this.b[this.o++]! << 8) | this.b[this.o++]!;
  }
  atEnd(): boolean {
    return this.o === this.b.length;
  }
}

function writeU16(n: number): Uint8Array {
  if (n < 0 || n > 0xffff) throw new BlobError("u16 overflow");
  return Uint8Array.from([(n >> 8) & 0xff, n & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodeWalletBlob(f: WalletBlobFields): Uint8Array {
  if (f.publicKey.length !== ED25519_PUBKEY_BYTES) throw new BlobError("pubkey");
  if (f.kdfSalt.length !== KDF_SALT_BYTES) throw new BlobError("salt");
  if (f.iv.length !== AES_GCM_IV_BYTES) throw new BlobError("iv");
  if (f.ciphertext.length !== EXPECTED_CIPHERTEXT_BYTES) throw new BlobError("ct");
  if (f.credentialId.length < 1 || f.credentialId.length > MAX_CREDENTIAL_ID_BYTES)
    throw new BlobError("credentialId");
  return concat([
    BLOB_MAGIC,
    Uint8Array.from([BLOB_VERSION]),
    f.publicKey,
    writeU16(f.credentialId.length),
    f.credentialId,
    f.kdfSalt,
    f.iv,
    writeU16(f.ciphertext.length),
    f.ciphertext,
  ]);
}

/** Strict decode. `bytes` is attacker-controlled; every field is bounded. */
export function decodeWalletBlob(bytes: Uint8Array): ParsedWalletBlob {
  // Hard size cap BEFORE structural parsing (§32).
  if (bytes.length < 4 + 1 + 32 + 2 + 1 + 32 + 12 + 2 + EXPECTED_CIPHERTEXT_BYTES)
    throw new BlobError("too short");
  if (bytes.length > MAX_BLOB_BYTES) throw new BlobError("too large");

  const r = new Reader(bytes);
  const magic = r.bytes(4);
  if (!bytesEqual(magic, BLOB_MAGIC)) throw new BlobError("bad magic");
  const version = r.u8();
  if (version !== BLOB_VERSION) throw new BlobError("unsupported version");

  const publicKey = r.bytes(ED25519_PUBKEY_BYTES).slice();
  const credLen = r.u16();
  if (credLen < 1 || credLen > MAX_CREDENTIAL_ID_BYTES)
    throw new BlobError("credentialId length");
  const credentialId = r.bytes(credLen).slice();
  const kdfSalt = r.bytes(KDF_SALT_BYTES).slice();
  const iv = r.bytes(AES_GCM_IV_BYTES).slice();
  const ctLen = r.u16();
  if (ctLen !== EXPECTED_CIPHERTEXT_BYTES) throw new BlobError("ciphertext length");
  const ciphertext = r.bytes(ctLen).slice();

  // Reject trailing bytes — no ambiguity / hidden data (§35, §38).
  if (!r.atEnd()) throw new BlobError("trailing bytes");

  return { version, publicKey, credentialId, kdfSalt, iv, ciphertext };
}

/**
 * Deterministic AAD binding the security-sensitive metadata (§7). Built from the
 * PARSED header fields plus the implementation-fixed rpId and HKDF label, so any
 * tamper of publicKey / credentialId / salt flips the AAD and fails GCM auth.
 * The `iv` is the GCM nonce and is intentionally not duplicated here.
 */
export function buildAad(
  header: Pick<ParsedWalletBlob, "publicKey" | "credentialId" | "kdfSalt">,
  rpId: string
): Uint8Array {
  const rp = utf8ToBytes(rpId);
  const info = utf8ToBytes(HKDF_INFO_LABEL);
  return concat([
    BLOB_MAGIC,
    Uint8Array.from([BLOB_VERSION]),
    header.publicKey,
    writeU16(header.credentialId.length),
    header.credentialId,
    header.kdfSalt,
    writeU16(rp.length),
    rp,
    writeU16(info.length),
    info,
  ]);
}
