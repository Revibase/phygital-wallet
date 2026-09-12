import { p256 } from "@noble/curves/nist.js";
import { describe, expect, it } from "vitest";

import { base64UrlEncode } from "../util/encoding.js";
import { verifyDynamicTap } from "./dynamic-url.js";

/** Build the 12-byte chip message independently: counter (BE u32) ‖ nonce (8). */
function chipMessage(counter: number, nonce: Uint8Array): Uint8Array {
  const msg = new Uint8Array(12);
  new DataView(msg.buffer).setUint32(0, counter, false); // false = big-endian
  msg.set(nonce, 4);
  return msg;
}

function tap(counter: number) {
  const secretKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(secretKey, true); // compressed, 33 bytes
  const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  // Sign with default opts so this mirrors exactly what production `verify` expects.
  const signature = p256.sign(chipMessage(counter, nonce), secretKey);
  return {
    pk: base64UrlEncode(publicKey),
    s: base64UrlEncode(signature),
    c: String(counter),
    n: base64UrlEncode(nonce),
  };
}

describe("verifyDynamicTap", () => {
  it("verifies a genuine tap and reports the counter", () => {
    const result = verifyDynamicTap(tap(7));
    expect(result.isVerified).toBe(true);
    expect(result.counter).toBe(7);
  });

  // The counter is big-endian inside the signed message; a byte-order slip
  // would still verify for small symmetric values, so use one that differs.
  it("uses big-endian counter encoding (0x01020304)", () => {
    const result = verifyDynamicTap(tap(0x01020304));
    expect(result.isVerified).toBe(true);
    expect(result.counter).toBe(0x01020304);
  });

  it("fails when the counter does not match what was signed", () => {
    const params = tap(7);
    const result = verifyDynamicTap({ ...params, c: "8" });
    expect(result.isVerified).toBe(false);
  });

  it("rejects malformed parameters", () => {
    const params = tap(1);
    expect(() =>
      verifyDynamicTap({ ...params, pk: base64UrlEncode(new Uint8Array(10)) })
    ).toThrow(/33-byte/);
    expect(() =>
      verifyDynamicTap({ ...params, n: base64UrlEncode(new Uint8Array(4)) })
    ).toThrow(/8 bytes/);
    expect(() => verifyDynamicTap({ ...params, c: "-1" })).toThrow(/uint32/);
  });
});
