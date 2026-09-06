import { getBase64Decoder } from "@solana/kit";

const base64Decoder = getBase64Decoder();

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
