import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { getBase58Decoder } from "@solana/kit";

import { createVerifierSignerBackend } from "./create.js";
import { SecretsVerifierBackend } from "./secrets.js";

const b58 = getBase58Decoder();

function keypair() {
  const seed = ed25519.utils.randomSecretKey().slice(0, 32);
  const pubkey = b58.decode(ed25519.getPublicKey(seed));
  return { seed, pubkey, seedB58: b58.decode(seed) };
}

describe("SecretsVerifierBackend", () => {
  it("signs with the matching verifier pubkey", async () => {
    const { seed, pubkey, seedB58 } = keypair();
    const backend = new SecretsVerifierBackend(
      JSON.stringify({ [pubkey]: seedB58 })
    );
    expect(backend.canSign(pubkey)).toBe(true);
    expect(
      backend.canSign("Other111111111111111111111111111111111111111")
    ).toBe(false);

    const msg = new Uint8Array([1, 2, 3, 4]);
    const sigB64 = await backend.sign(pubkey, msg);
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    expect(ed25519.verify(sig, msg, ed25519.getPublicKey(seed))).toBe(true);
  });

  it("rejects pubkey/seed mismatch at construct", () => {
    const { seedB58 } = keypair();
    const { pubkey: other } = keypair();
    expect(
      () => new SecretsVerifierBackend(JSON.stringify({ [other]: seedB58 }))
    ).toThrow(/pubkey mismatch/);
  });

  it("rejects more than 8 keys", () => {
    const map: Record<string, string> = {};
    for (let i = 0; i < 9; i++) {
      const { pubkey, seedB58 } = keypair();
      map[pubkey] = seedB58;
    }
    expect(() => new SecretsVerifierBackend(JSON.stringify(map))).toThrow(
      /at most 8/
    );
  });
});

describe("createVerifierSignerBackend", () => {
  it("rejects kms until implemented", () => {
    expect(() =>
      createVerifierSignerBackend({
        VERIFIER_SIGNER_BACKEND: "kms",
      })
    ).toThrow(/not implemented/);
  });
});
