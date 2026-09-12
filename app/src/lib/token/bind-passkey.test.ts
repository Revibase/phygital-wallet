import { describe, expect, it } from "vitest";

import {
  PASSKEY_MISMATCH,
  PASSKEY_NOT_VERIFIED,
  bindVerifiedPasskey,
} from "./bind-passkey";

describe("bindVerifiedPasskey", () => {
  it("returns the passkey when verified and unbound", () => {
    expect(
      bindVerifiedPasskey({
        isVerified: true,
        secp256r1PublicKey: "abc",
      })
    ).toBe("abc");
  });

  it("accepts a matching expected passkey", () => {
    expect(
      bindVerifiedPasskey(
        { isVerified: true, secp256r1PublicKey: "abc" },
        "abc"
      )
    ).toBe("abc");
  });

  it("rejects a verified tap for a different chip", () => {
    expect(() =>
      bindVerifiedPasskey(
        { isVerified: true, secp256r1PublicKey: "abc" },
        "xyz"
      )
    ).toThrow(PASSKEY_MISMATCH);
  });

  it("rejects an unverified response", () => {
    expect(() =>
      bindVerifiedPasskey({
        isVerified: false,
        secp256r1PublicKey: "abc",
      })
    ).toThrow(PASSKEY_NOT_VERIFIED);
  });
});
