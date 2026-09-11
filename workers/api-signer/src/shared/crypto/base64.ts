import { getBase64Decoder, getBase64Encoder } from "@solana/kit";

const base64Decoder = getBase64Decoder();
const base64Encoder = getBase64Encoder();

/** Bytes → base64 string (kit). */
export function bytesToBase64(bytes: Uint8Array): string {
  return base64Decoder.decode(bytes);
}

/** Base64 string → bytes (kit). */
export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(base64Encoder.encode(value));
}

/** Standard base64 → URL-safe (`-`/`_`, no padding). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
