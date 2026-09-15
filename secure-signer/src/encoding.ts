/**
 * Small, dependency-free byte<->string codecs used on the trust boundary.
 *
 * WHY hand-rolled + strict: these decode ATTACKER-CONTROLLED strings (§38 fuzz
 * targets). They must never throw on odd input in a way that leaks state, never
 * over-allocate, and reject non-canonical encodings rather than silently
 * "fixing" them (a lenient decoder is a source of parser differentials, §39).
 */

const B64_STD =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function buildLookup(alphabet: string): Int16Array {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
}

const STD_LOOKUP = buildLookup(B64_STD);
const URL_LOOKUP = buildLookup(B64_URL);

export class DecodeError extends Error {}

/**
 * Decode a base64 / base64url string with a hard output cap.
 * @param maxBytes reject (before allocating the full result) if the decoded
 *   length would exceed this. Callers pass a tight cap from constants.
 */
export function base64ToBytes(
  input: string,
  maxBytes: number,
  variant: "std" | "url" = "std"
): Uint8Array {
  if (typeof input !== "string") throw new DecodeError("not a string");
  // Strip a single run of trailing '=' padding (0-2). Reject padding elsewhere.
  let end = input.length;
  let pad = 0;
  while (end > 0 && input.charCodeAt(end - 1) === 0x3d /* '=' */) {
    end--;
    pad++;
    if (pad > 2) throw new DecodeError("excess padding");
  }
  const len = end;
  // Cheap length pre-check before allocating (§32): 4 chars -> 3 bytes.
  const approxOut = Math.floor((len * 3) / 4);
  if (approxOut > maxBytes) throw new DecodeError("too large");
  if (len % 4 === 1) throw new DecodeError("invalid length");

  const lookup = variant === "url" ? URL_LOOKUP : STD_LOOKUP;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const code = input.charCodeAt(i);
    const val = code < 128 ? lookup[code]! : -1;
    if (val < 0) throw new DecodeError("invalid character");
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      if (out.length > maxBytes) throw new DecodeError("too large");
    }
  }
  // Reject non-canonical trailing bits (must be zero) to avoid two encodings
  // mapping to the same bytes.
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new DecodeError("non-canonical trailing bits");
  }
  return Uint8Array.from(out);
}

export function bytesToBase64(
  bytes: Uint8Array,
  variant: "std" | "url" = "std"
): string {
  const alphabet = variant === "url" ? B64_URL : B64_STD;
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      alphabet[(n >> 18) & 63]! +
      alphabet[(n >> 12) & 63]! +
      alphabet[(n >> 6) & 63]! +
      alphabet[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]!;
    if (variant === "std") out += "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      alphabet[(n >> 18) & 63]! +
      alphabet[(n >> 12) & 63]! +
      alphabet[(n >> 6) & 63]!;
    if (variant === "std") out += "=";
  }
  return out;
}

export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Constant-time byte comparison for equal-length secrets/pubkeys. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
