import { address, type Transaction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { assertSupportedTransactionLifetime } from "./signer.js";

const BLOCKHASH = "11111111111111111111111111111111";

describe("assertSupportedTransactionLifetime", () => {
  it("rejects durable nonce transactions", () => {
    const transaction = {
      lifetimeConstraint: {
        nonce: BLOCKHASH,
        nonceAccountAddress: address(BLOCKHASH),
      },
      messageBytes: new Uint8Array(),
      signatures: {},
    } as unknown as Transaction;

    expect(() => assertSupportedTransactionLifetime(transaction)).toThrow(
      "getPhygitalWalletSigner does not support durable nonce transactions; use a recent blockhash lifetime"
    );
  });

  it("accepts recent blockhash transactions", () => {
    const transaction = {
      lifetimeConstraint: {
        blockhash: BLOCKHASH,
        lastValidBlockHeight: 1n,
      },
      messageBytes: new Uint8Array(),
      signatures: {},
    } as unknown as Transaction;

    expect(() => assertSupportedTransactionLifetime(transaction)).not.toThrow();
  });
});
