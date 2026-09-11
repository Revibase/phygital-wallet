/**
 * Verify an NFC dynamic-URL tap (`pk` / `s` / `c` / `n`) — pure P-256 ECDSA
 * over `counter(4, BE) ‖ nonce(8)`, no counter consumption and no server secret.
 * The `pk` param is the accessory identifier from the NFC URL. Its current
 * encoding is a 33-byte compressed P-256 key, which is also used to verify the
 * tap signature.
 *
 * Counter anti-replay is enforced separately by the caller (the verifier's
 * per-chip high-water), since it is stateful.
 */
import { p256 } from "@noble/curves/nist.js";
import { Endian, getU32Encoder } from "@solana/kit";

import { base64UrlDecode } from "../util/encoding.js";

export type DynamicTapParams = {
  /** base64url accessory identifier; currently a compressed P-256 key. */
  pk: string;
  /** base64url 64-byte raw r‖s ECDSA signature. */
  s: string;
  /** uint32 counter, decimal string or number. */
  c: string | number;
  /** base64url 8-byte nonce. */
  n: string;
};

export type DynamicTapResult = {
  isVerified: boolean;
  /** The accessory identifier (`pk`), currently a base64url compressed key. */
  identifier: string;
  counter: number;
};

const u32BigEndian = getU32Encoder({ endian: Endian.Big });

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** ECDSA low-S normalization for P-256 raw r‖s signatures. */
function normalizeSignatureToLowS(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) {
    throw new Error(
      `expected 64-byte raw r||s signature, got ${signature.length} bytes`
    );
  }
  const order = p256.Point.CURVE().n;
  const halfOrder = order / BigInt(2);
  const sBig = BigInt(`0x${toHex(signature.slice(32, 64))}`);
  if (sBig <= halfOrder) return signature;
  const sLow = order - sBig;
  const sPad = fromHex(sLow.toString(16).padStart(64, "0"));
  const normalized = new Uint8Array(64);
  normalized.set(signature.slice(0, 32), 0);
  normalized.set(sPad, 32);
  return normalized;
}

export function verifyDynamicTap(params: DynamicTapParams): DynamicTapResult {
  const { pk: identifier, s: signature, c, n: nonce } = params;
  if (!identifier || !signature || c === undefined || c === null || !nonce) {
    throw new Error("Missing tap parameters");
  }

  const compressedPk = base64UrlDecode(identifier);
  if (compressedPk.length !== 33) {
    throw new Error(
      `pk must be 33-byte compressed P-256 key, got ${compressedPk.length} bytes`
    );
  }
  const randomBytes = base64UrlDecode(nonce);
  if (randomBytes.length !== 8) {
    throw new Error(`n must be 8 bytes, got ${randomBytes.length} bytes`);
  }
  const rawSig = base64UrlDecode(signature);
  if (rawSig.length !== 64) {
    throw new Error(
      `s must be 64-byte raw ECDSA signature, got ${rawSig.length} bytes`
    );
  }
  const currentCounter = typeof c === "number" ? c : Number.parseInt(c, 10);
  if (
    !Number.isInteger(currentCounter) ||
    currentCounter < 0 ||
    currentCounter > 0xffffffff
  ) {
    throw new Error(`counter out of uint32 range: ${currentCounter}`);
  }

  const message = new Uint8Array(12);
  message.set(u32BigEndian.encode(currentCounter), 0);
  message.set(randomBytes, 4);

  const normalizedSig = normalizeSignatureToLowS(rawSig);
  const isVerified = p256.verify(normalizedSig, message, compressedPk);
  return { isVerified, identifier, counter: currentCounter };
}
