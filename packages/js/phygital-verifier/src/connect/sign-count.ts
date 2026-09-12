/**
 * WebAuthn signature counter — the replay defence for a Hold proof.
 *
 * `authenticatorData` layout: `rpIdHash(32) ‖ flags(1) ‖ signCount(4, big-endian)`
 * and the whole of it is covered by the assertion signature
 * (`authenticatorData ‖ SHA-256(clientDataJSON)`). So the counter cannot be
 * altered by whoever relays the proof — unlike anything the client supplies
 * alongside it.
 *
 * The accessory increments it per assertion, so requiring it to be strictly
 * greater than the last value accepted for that accessory makes every proof
 * single-use. This is the same shape as the dynamic tap's chip counter; the two
 * are separate registers on the chip and must be tracked separately.
 */
import { base64UrlDecode } from "../util/encoding.js";

const SIGN_COUNT_OFFSET = 33;
const AUTH_DATA_MIN_LEN = SIGN_COUNT_OFFSET + 4;

/**
 * Read the signature counter out of a WebAuthn assertion's `authenticatorData`.
 * Returns `null` when the data is too short to contain one.
 */
export function extractSignCount(
  authenticatorDataBase64Url: string
): number | null {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(authenticatorDataBase64Url);
  } catch {
    return null;
  }
  if (bytes.length < AUTH_DATA_MIN_LEN) return null;

  return (
    ((bytes[SIGN_COUNT_OFFSET]! << 24) |
      (bytes[SIGN_COUNT_OFFSET + 1]! << 16) |
      (bytes[SIGN_COUNT_OFFSET + 2]! << 8) |
      bytes[SIGN_COUNT_OFFSET + 3]!) >>>
    0
  );
}
