import { describe, expect, it } from "vitest";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

import {
  extractCredentialFromAttestationObject,
  resolveWebAuthnRpId,
  verifyOwnerWalletAssertion,
} from "./verify-webauthn-assertion";

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function buildAttestationObjectB64url(opts: {
  credentialId: Uint8Array;
  rpId: string;
}): Promise<{ b64: string; publicKey: Uint8Array }> {
  const cose = new Map();
  cose.set(1, 2); // kty: EC2
  cose.set(3, -7); // alg: ES256
  cose.set(-1, 1); // crv: P-256
  cose.set(-2, new Uint8Array(32).fill(1));
  cose.set(-3, new Uint8Array(32).fill(2));
  const publicKey = isoCBOR.encode(cose);

  const rpIdHash = await sha256(new TextEncoder().encode(opts.rpId));
  const authData = new Uint8Array(
    32 + 1 + 4 + 16 + 2 + opts.credentialId.length + publicKey.length,
  );
  let o = 0;
  authData.set(rpIdHash, o);
  o += 32;
  authData[o++] = 0x41; // UP | AT
  o += 4; // signCount
  o += 16; // aaguid
  authData[o++] = (opts.credentialId.length >> 8) & 0xff;
  authData[o++] = opts.credentialId.length & 0xff;
  authData.set(opts.credentialId, o);
  o += opts.credentialId.length;
  authData.set(publicKey, o);

  const attestation = new Map();
  attestation.set("fmt", "none");
  attestation.set("attStmt", new Map());
  attestation.set("authData", authData);
  return {
    b64: isoBase64URL.fromBuffer(isoCBOR.encode(attestation)),
    publicKey,
  };
}

describe("resolveWebAuthnRpId", () => {
  it("maps localhost and revibase hostnames", () => {
    expect(resolveWebAuthnRpId("localhost")).toBe("localhost");
    expect(resolveWebAuthnRpId("127.0.0.1")).toBe("localhost");
    expect(resolveWebAuthnRpId("revibase.com")).toBe("revibase.com");
    expect(resolveWebAuthnRpId("p.revibase.com")).toBe("revibase.com");
    expect(resolveWebAuthnRpId("app.revibase.com")).toBe("revibase.com");
  });

  it("falls back to hostname", () => {
    expect(resolveWebAuthnRpId("wallet.example.org")).toBe(
      "wallet.example.org",
    );
  });
});

describe("extractCredentialFromAttestationObject", () => {
  it("returns COSE key and credential ID from attestedCredentialData", async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { b64, publicKey } = await buildAttestationObjectB64url({
      credentialId,
      rpId: "revibase.com",
    });
    const extracted = await extractCredentialFromAttestationObject(
      b64,
      "revibase.com",
    );
    expect(extracted.credentialId).toEqual(credentialId);
    expect(extracted.publicKey).toEqual(publicKey);
  });

  it("rejects rpIdHash mismatch", async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { b64 } = await buildAttestationObjectB64url({
      credentialId,
      rpId: "evil.example",
    });
    await expect(
      extractCredentialFromAttestationObject(b64, "revibase.com"),
    ).rejects.toThrow(/rpIdHash/);
  });

  it("rejects attestation without attested credential data", async () => {
    // UP only — no AT flag, so no credentialID / publicKey.
    const authData = new Uint8Array(37);
    authData[32] = 0x01;
    const attestation = new Map();
    attestation.set("fmt", "none");
    attestation.set("attStmt", new Map());
    attestation.set("authData", authData);
    const b64 = isoBase64URL.fromBuffer(isoCBOR.encode(attestation));
    await expect(
      extractCredentialFromAttestationObject(b64, "revibase.com"),
    ).rejects.toThrow(/credentialPublicKey|credentialID/);
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
