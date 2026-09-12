import { describe, expect, it } from "vitest";

import { mapGtfaTransaction } from "@/lib/wallet/activity-from-rpc";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";

const WALLET = "Wallet1111111111111111111111111111111111111";
const OTHER = "Other11111111111111111111111111111111111111";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("mapGtfaTransaction", () => {
  it("maps a SOL send (fee payer) without counting the fee as outflow", () => {
    const item = mapGtfaTransaction(WALLET, {
      blockTime: 1_700_000_000,
      transaction: {
        signatures: ["sigSend"],
        message: {
          accountKeys: [{ pubkey: WALLET }, { pubkey: OTHER }],
        },
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [2_000_005_000, 0],
        postBalances: [1_000_000_000, 1_000_000_000],
      },
    });
    expect(item?.kind).toBe("sent");
    expect(item?.title).toBe("Sent SOL");
    expect(item?.balanceDeltas).toEqual([
      { mint: NATIVE_SOL_MINT, direction: "out", amountUi: "1" },
    ]);
  });

  it("maps a token receive via ATA owner even if wallet is not in account keys", () => {
    const item = mapGtfaTransaction(WALLET, {
      blockTime: 1_700_000_001,
      transaction: {
        signatures: ["sigRecv"],
        message: {
          accountKeys: [
            { pubkey: OTHER },
            { pubkey: "Ata111111111111111111111111111111111111111" },
          ],
        },
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000_000, 2_039_280],
        postBalances: [999_995_000, 2_039_280],
        preTokenBalances: [
          {
            accountIndex: 1,
            mint: USDC,
            owner: WALLET,
            uiTokenAmount: { uiAmount: 1, decimals: 6, amount: "1000000" },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: 1,
            mint: USDC,
            owner: WALLET,
            uiTokenAmount: { uiAmount: 5, decimals: 6, amount: "5000000" },
          },
        ],
      },
    });
    expect(item?.kind).toBe("received");
    expect(item?.title).toBe("Received EPjF…Dt1v");
    expect(item?.balanceDeltas).toEqual([
      { mint: USDC, direction: "in", amountUi: "4" },
    ]);
  });

  it("marks failed txs", () => {
    const item = mapGtfaTransaction(WALLET, {
      transaction: {
        signatures: ["sigFail"],
        message: { accountKeys: [{ pubkey: WALLET }] },
      },
      meta: {
        err: { InstructionError: [0, "Custom"] },
        fee: 5000,
        preBalances: [1_000_005_000],
        postBalances: [1_000_000_000],
      },
    });
    expect(item?.kind).toBe("failed");
    expect(item?.title).toBe("Failed");
    expect(item?.statusLabel).toBe("Failed");
  });
});
