import { describe, expect, it } from "vitest";
import { p256 } from "@noble/curves/nist.js";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import {
  derEcdsaToCompact,
  parseStoredWebauthnPublicKeys,
  recoverCosePublicKeysFromAssertion,
  selectWebauthnPublicKeyB64url,
} from "./recover-webauthn-key";

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function compactToDer(compact: Uint8Array): Uint8Array {
  const encInt = (half: Uint8Array): Uint8Array => {
    let v = half;
    while (v.length > 1 && v[0] === 0 && (v[1]! & 0x80) === 0) {
      v = v.subarray(1);
    }
    if (v[0]! & 0x80) {
      const padded = new Uint8Array(v.length + 1);
      padded.set(v, 1);
      v = padded;
    }
    const out = new Uint8Array(2 + v.length);
    out[0] = 0x02;
    out[1] = v.length;
    out.set(v, 2);
    return out;
  };
  const r = encInt(compact.subarray(0, 32));
  const s = encInt(compact.subarray(32, 64));
  const body = new Uint8Array(r.length + s.length);
  body.set(r, 0);
  body.set(s, r.length);
  const out = new Uint8Array(2 + body.length);
  out[0] = 0x30;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

async function signAssertion(opts: {
  priv: Uint8Array;
  challenge: string;
  origin: string;
  rpId?: string;
}): Promise<{
  assertion: AuthenticationResponseJSON;
  expectedCose: Uint8Array;
}> {
  const rpId = opts.rpId ?? "revibase.com";
  const pubUncomp = p256.getPublicKey(opts.priv, false);
  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const authData = new Uint8Array(37);
  authData.set(rpIdHash, 0);
  authData[32] = 0x05; // UP | UV
  const clientData = new TextEncoder().encode(
    JSON.stringify({
      type: "webauthn.get",
      challenge: opts.challenge,
      origin: opts.origin,
    }),
  );
  const clientHash = await sha256(clientData);
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);
  const msgHash = await sha256(signed);
  const compact = p256.sign(msgHash, opts.priv, { prehash: false });
  const der = compactToDer(compact);
  const expectedCose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, pubUncomp.subarray(1, 33)],
      [-3, pubUncomp.subarray(33, 65)],
    ]),
  );
  return {
    expectedCose,
    assertion: {
      id: "AA",
      rawId: "AA",
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(new Uint8Array(clientData)),
        authenticatorData: isoBase64URL.fromBuffer(new Uint8Array(authData)),
        signature: isoBase64URL.fromBuffer(new Uint8Array(der)),
      },
    },
  };
}

describe("derEcdsaToCompact", () => {
  it("round-trips a compact signature", () => {
    const compact = new Uint8Array(64);
    compact[0] = 0x80;
    compact[31] = 1;
    compact[32] = 0x7f;
    compact[63] = 2;
    expect(derEcdsaToCompact(compactToDer(compact))).toEqual(compact);
  });
});

describe("recoverCosePublicKeysFromAssertion", () => {
  it("includes the real COSE key among recovery candidates", async () => {
    const priv = p256.utils.randomSecretKey();
    const { assertion, expectedCose } = await signAssertion({
      priv,
      challenge: "AAAA",
      origin: "https://app.revibase.com",
    });
    const recovered = await recoverCosePublicKeysFromAssertion(assertion);
    expect(recovered.length).toBeGreaterThanOrEqual(1);
    expect(
      recovered.some((k) => Buffer.from(k).equals(Buffer.from(expectedCose))),
    ).toBe(true);
  });
});

describe("selectWebauthnPublicKeyB64url", () => {
  it("filters to the real key with a confirm assertion", async () => {
    const priv = p256.utils.randomSecretKey();
    const origin = "https://app.revibase.com";
    const unlock = await signAssertion({
      priv,
      challenge: "unlockChallenge",
      origin,
    });
    const confirm = await signAssertion({
      priv,
      challenge: "confirmChallenge",
      origin,
    });
    const selected = await selectWebauthnPublicKeyB64url({
      unlockAssertion: unlock.assertion,
      confirmAssertion: confirm.assertion,
      expectedConfirmChallenge: "confirmChallenge",
      origin,
    });
    expect(selected).toBe(
      isoBase64URL.fromBuffer(new Uint8Array(unlock.expectedCose)),
    );
  });
});

describe("parseStoredWebauthnPublicKeys", () => {
  it("parses a single key and a JSON list", () => {
    const one = isoBase64URL.fromBuffer(new Uint8Array([1, 2, 3]));
    expect(parseStoredWebauthnPublicKeys(one)).toEqual([
      new Uint8Array([1, 2, 3]),
    ]);
    const two = JSON.stringify([
      isoBase64URL.fromBuffer(new Uint8Array([1])),
      isoBase64URL.fromBuffer(new Uint8Array([2])),
    ]);
    expect(parseStoredWebauthnPublicKeys(two)).toEqual([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
  });
});
