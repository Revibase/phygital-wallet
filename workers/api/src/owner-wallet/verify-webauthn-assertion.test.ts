import { describe, expect, it } from "vitest";

import {
  resolveWebAuthnRpId,
  verifyOwnerWalletAssertion,
} from "./verify-webauthn-assertion";

describe("resolveWebAuthnRpId", () => {
  it("prefers env override", () => {
    expect(resolveWebAuthnRpId("app.example.com", "custom.example")).toBe(
      "custom.example",
    );
  });

  it("maps localhost and revibase hostnames", () => {
    expect(resolveWebAuthnRpId("localhost")).toBe("localhost");
    expect(resolveWebAuthnRpId("127.0.0.1")).toBe("localhost");
    expect(resolveWebAuthnRpId("revibase.com")).toBe("revibase.com");
    expect(resolveWebAuthnRpId("p.revibase.com")).toBe("revibase.com");
    expect(resolveWebAuthnRpId("app.revibase.com")).toBe("revibase.com");
  });

  it("falls back to hostname", () => {
    expect(resolveWebAuthnRpId("wallet.example.org")).toBe("wallet.example.org");
  });
});

describe("verifyOwnerWalletAssertion", () => {
  it("rejects non-app origins before crypto verify", async () => {
    const result = await verifyOwnerWalletAssertion({
      assertion: {
        id: "x",
        rawId: "x",
        type: "public-key",
        response: {
          clientDataJSON: "e30",
          authenticatorData: "AA",
          signature: "AA",
        },
        clientExtensionResults: {},
      },
      expectedChallenge: "challenge",
      origin: "https://evil.example",
      storedPublicKeyBytes: new Uint8Array(65),
    });
    expect(result).toEqual({
      ok: false,
      error: "App origin required",
      code: "origin_required",
      status: 403,
    });
  });

  it("rejects malformed origin", async () => {
    const result = await verifyOwnerWalletAssertion({
      assertion: {
        id: "x",
        rawId: "x",
        type: "public-key",
        response: {
          clientDataJSON: "e30",
          authenticatorData: "AA",
          signature: "AA",
        },
        clientExtensionResults: {},
      },
      expectedChallenge: "challenge",
      origin: "not-a-url",
      storedPublicKeyBytes: new Uint8Array(65),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("origin_required");
    }
  });
});
