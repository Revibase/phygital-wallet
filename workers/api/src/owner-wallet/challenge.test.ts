import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";

import { putChallengeMessage } from "./challenge";

describe("putChallengeMessage", () => {
  it("domain-separates the challenge so raw challenge bytes are not signed bare", () => {
    const challenge = new Uint8Array(32).fill(7);
    const msg = putChallengeMessage(challenge);
    expect(msg.length).toBeGreaterThan(32);
    expect(msg.slice(-32)).toEqual(challenge);
    const prefix = new TextDecoder().decode(msg.slice(0, msg.length - 32));
    expect(prefix).toBe("revibase.owner-wallet.put.v1");
  });

  it("produces a message verifiable with ed25519", () => {
    const seed = new Uint8Array(32).fill(1);
    const pub = ed25519.getPublicKey(seed);
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const msg = putChallengeMessage(challenge);
    const sig = ed25519.sign(msg, seed);
    expect(ed25519.verify(sig, msg, pub)).toBe(true);
  });
});
