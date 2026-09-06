import { Endian, getU32Encoder } from "@solana/kit";
import { p256 } from "@noble/curves/nist.js";

import { base64UrlToBytes } from "@/shared/crypto/base64";

export type VerifyDynamicUrlResult = {
  isVerified: boolean;
  identifier: string;
  counter: number;
};

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToUint8Array(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** ECDSA low-S normalization for P-256 raw r||s signatures. */
function normalizeSignatureToLowS(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) {
    throw new Error(
      `expected 64-byte raw r||s signature, got ${signature.length} bytes`,
    );
  }
  const order = p256.Point.CURVE().n;
  const halfOrder = order / BigInt(2);
  const sBig = BigInt(`0x${uint8ArrayToHex(signature.slice(32, 64))}`);
  if (sBig <= halfOrder) return signature;
  const sLow = order - sBig;
  const sPad = hexToUint8Array(sLow.toString(16).padStart(64, "0"));
  const normalized = new Uint8Array(64);
  normalized.set(signature.slice(0, 32), 0);
  normalized.set(sPad, 32);
  return normalized;
}

/**
 * Verify an NFC dynamic-URL tap (`pk` / `s` / `c` / `n`) without consuming a
 * counter. Same crypto as revibase vault / phygital-token-sdk ≤0.13.
 *
 * Counter anti-replay is enforced by `/verify-tap`: next `c` must be greater
 * than the high-water mark in `revibase_counter` KV.
 */
export function verifyDynamicUrlWithoutCounterCheck(
  params: URLSearchParams,
): VerifyDynamicUrlResult {
  const identifier = params.get("pk");
  const signature = params.get("s");
  const counter = params.get("c");
  const nonce = params.get("n");
  if (!identifier || !signature || !counter || !nonce) {
    throw new Error("Missing query params");
  }

  const compressedPk = base64UrlToBytes(identifier);
  if (compressedPk.length !== 33) {
    throw new Error(
      `pk must be 33-byte compressed P-256 key, got ${compressedPk.length} bytes`,
    );
  }
  const randomBytes = base64UrlToBytes(nonce);
  if (randomBytes.length !== 8) {
    throw new Error(`n must be 8 bytes, got ${randomBytes.length} bytes`);
  }
  const rawSig = base64UrlToBytes(signature);
  if (rawSig.length !== 64) {
    throw new Error(
      `s must be 64-byte raw ECDSA signature, got ${rawSig.length} bytes`,
    );
  }
  const currentCounter = Number.parseInt(counter, 10);
  if (
    !Number.isInteger(currentCounter) ||
    currentCounter < 0 ||
    currentCounter > 0xffffffff
  ) {
    throw new Error(`counter out of uint32 range: ${currentCounter}`);
  }

  const counterBytes = getU32Encoder({ endian: Endian.Big }).encode(
    currentCounter,
  );
  const message = new Uint8Array(12);
  message.set(counterBytes, 0);
  message.set(randomBytes, 4);
  const normalizedSig = normalizeSignatureToLowS(rawSig);
  const isVerified = p256.verify(normalizedSig, message, compressedPk);
  return {
    isVerified,
    identifier,
    counter: currentCounter,
  };
}
