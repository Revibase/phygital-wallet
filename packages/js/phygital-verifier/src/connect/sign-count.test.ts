import { describe, expect, it } from "vitest";

import { base64UrlEncode } from "../util/encoding.js";
import { extractSignCount } from "./sign-count.js";

/** authenticatorData: rpIdHash(32) ‖ flags(1) ‖ signCount(4, big-endian). */
function authData(signCount: number, totalLen = 37) {
  const bytes = new Uint8Array(totalLen);
  bytes.fill(0xab, 0, 32); // rpIdHash
  bytes[32] = 0x05; // flags
  new DataView(bytes.buffer).setUint32(33, signCount, false);
  return base64UrlEncode(bytes);
}

describe("extractSignCount", () => {
  it("reads the counter", () => {
    expect(extractSignCount(authData(0))).toBe(0);
    expect(extractSignCount(authData(1))).toBe(1);
    expect(extractSignCount(authData(42))).toBe(42);
  });

  // A byte-order slip still passes for small symmetric values, so use one whose
  // big-endian and little-endian readings differ.
  it("is big-endian", () => {
    expect(extractSignCount(authData(0x01020304))).toBe(0x01020304);
  });

  it("handles the full uint32 range without sign overflow", () => {
    expect(extractSignCount(authData(0xffffffff))).toBe(0xffffffff);
    expect(extractSignCount(authData(0x80000000))).toBe(0x80000000);
  });

  it("tolerates trailing extension data", () => {
    expect(extractSignCount(authData(7, 120))).toBe(7);
  });

  it("returns null when there is no counter to read", () => {
    expect(extractSignCount(base64UrlEncode(new Uint8Array(33)))).toBeNull();
    expect(extractSignCount(base64UrlEncode(new Uint8Array(0)))).toBeNull();
  });
});
