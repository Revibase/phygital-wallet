import { getBase64Decoder, getBase64Encoder } from "@solana/kit";

const base64Encoder = getBase64Encoder();
const base64Decoder = getBase64Decoder();

/** Base64 string → bytes (kit). */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(base64Encoder.encode(base64));
}

/** Bytes → base64 string (kit). */
export function bytesToBase64(bytes: Uint8Array): string {
  return base64Decoder.decode(bytes);
}

/** Standard base64 → URL-safe (`-`/`_`, no padding). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** URL-safe base64 (`-`/`_`, optional padding) → bytes. */
export function base64UrlToBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return base64ToBytes(padded + "=".repeat(padLen));
}
