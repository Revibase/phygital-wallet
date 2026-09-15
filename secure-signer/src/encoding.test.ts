import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesEqual, DecodeError } from "./encoding.js";

describe("base64 codec", () => {
  it("round-trips std and url variants", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      expect(base64ToBytes(bytesToBase64(bytes, "std"), 4096, "std")).toEqual(bytes);
      expect(base64ToBytes(bytesToBase64(bytes, "url"), 4096, "url")).toEqual(bytes);
    }
  });

  it("rejects invalid characters", () => {
    expect(() => base64ToBytes("****", 4096)).toThrow(DecodeError);
    // url chars are invalid under std variant
    expect(() => base64ToBytes("a-_b", 4096, "std")).toThrow(DecodeError);
  });

  it("enforces the output cap before allocating", () => {
    const big = bytesToBase64(new Uint8Array(1000));
    expect(() => base64ToBytes(big, 100)).toThrow(/too large/);
  });

  it("rejects excess padding and bad length", () => {
    expect(() => base64ToBytes("QQ===", 100)).toThrow(DecodeError);
    expect(() => base64ToBytes("A", 100)).toThrow(/invalid length/);
  });

  it("rejects non-canonical trailing bits", () => {
    // "QQ" decodes 'A' (0x41) but the second symbol carries nonzero low bits in "QR".
    expect(() => base64ToBytes("QR", 100)).toThrow(/non-canonical/);
  });

  it("bytesEqual is length-safe", () => {
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(bytesEqual(Uint8Array.of(1), Uint8Array.of(1, 2))).toBe(false);
  });
});
