import { p256 } from "@noble/curves/nist.js";
import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import { base64UrlEncode } from "../util/encoding.js";
import { verifyDynamicConnectProof } from "./verify-dynamic.js";

const TOKEN = "So11111111111111111111111111111111111111112" as Address;
const OTHER_TOKEN = "So11111111111111111111111111111111111111113" as Address;
const MINT = "Mint1111111111111111111111111111111111111111" as Address;

// The token resolution (identifier → mint → PDA) is on-chain, so mock it here
// and keep the test focused on the proof/counter logic `verifyDynamicConnectProof`
// owns. `fetchPhygitalTokenByIdentifier` returns the resolved chip account; the
// map below decides which token `findPhygitalTokenPda` derives from it.
const tokenForMint = new Map<string, Address>([[String(MINT), TOKEN]]);
vi.mock("phygital-token-sdk", () => ({
  fetchPhygitalTokenByIdentifier: vi.fn(async () => ({ publicKey: MINT })),
  findPhygitalTokenPda: vi.fn(
    async (mint: Address) => tokenForMint.get(String(mint)) ?? OTHER_TOKEN
  ),
}));

function chipMessage(counter: number, nonce: Uint8Array): Uint8Array {
  const msg = new Uint8Array(12);
  new DataView(msg.buffer).setUint32(0, counter, false);
  msg.set(nonce, 4);
  return msg;
}

function tap(counter: number) {
  const secretKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(secretKey, true);
  const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const signature = p256.sign(chipMessage(counter, nonce), secretKey);
  return {
    pk: base64UrlEncode(publicKey),
    s: base64UrlEncode(signature),
    c: String(counter),
    n: base64UrlEncode(nonce),
  };
}

/** An rpc that fails loudly if touched, proving no on-chain scan happened. */
const rpcThatMustNotBeUsed = new Proxy({} as Rpc<SolanaRpcApi>, {
  get() {
    throw new Error("rpc should not be used before the signature is verified");
  },
});
const rpc = {} as Rpc<SolanaRpcApi>;

describe("verifyDynamicConnectProof", () => {
  it("verifies a tap whose resolved token matches the expected token", async () => {
    const consumeCounter = vi.fn().mockResolvedValue(true);
    const result = await verifyDynamicConnectProof(tap(7), {
      rpc,
      expectedPhygitalToken: TOKEN,
      consumeCounter,
    });
    expect(result.phygitalToken).toBe(TOKEN);
    expect(result.counter).toBe(7);
    expect(consumeCounter).toHaveBeenCalledWith(
      expect.objectContaining({ counter: 7, phygitalToken: TOKEN })
    );
  });

  it("rejects when the resolved token differs from the expected token", async () => {
    await expect(
      verifyDynamicConnectProof(tap(7), {
        rpc,
        expectedPhygitalToken: OTHER_TOKEN,
        consumeCounter: async () => true,
      })
    ).rejects.toMatchObject({ code: "token_not_found" });
  });

  it("rejects a replayed counter (consumeCounter returns false)", async () => {
    await expect(
      verifyDynamicConnectProof(tap(7), {
        rpc,
        expectedPhygitalToken: TOKEN,
        consumeCounter: async () => false,
      })
    ).rejects.toMatchObject({ code: "tap_replay" });
  });

  it("rejects a bad signature before any token resolution", async () => {
    const bad = { ...tap(7), s: base64UrlEncode(new Uint8Array(64)) };
    await expect(
      verifyDynamicConnectProof(bad, {
        rpc: rpcThatMustNotBeUsed,
        expectedPhygitalToken: TOKEN,
        consumeCounter: async () => true,
      })
    ).rejects.toMatchObject({ code: "invalid_signature" });
  });
});
