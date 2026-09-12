import { describe, expect, it } from "vitest";

import {
  activityRowsFromResult,
  NATIVE_SOL_MINT,
  WALLET_ACTIVITY_PARSER_VERSION,
  type SubscribeTxResult,
} from "./wallet-activity";

const SENDER = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const RECIPIENT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "3n1x".padEnd(64, "a");

function result(
  overrides: Partial<SubscribeTxResult["transaction"]>
): SubscribeTxResult {
  return {
    signature: SIG,
    slot: 100,
    transaction: {
      transaction: {
        signatures: [SIG],
        message: { accountKeys: [] },
      },
      meta: {},
      ...overrides,
    },
  };
}

describe("activityRowsFromResult", () => {
  it("maps a SOL send with the fee stripped from the payer's delta", () => {
    const rows = activityRowsFromResult(
      result({
        transaction: {
          signatures: [SIG],
          message: {
            accountKeys: [{ pubkey: SENDER }, { pubkey: RECIPIENT }],
          },
        },
        meta: {
          err: null,
          fee: 5000,
          // sender: -1 SOL - 5000 fee ; recipient: +1 SOL
          preBalances: [2_000_000_000, 0],
          postBalances: [999_995_000, 1_000_000_000],
        },
      }),
      1_700_000_000
    );

    const sender = rows.find((r) => r.walletAddress === SENDER)!;
    expect(sender.kind).toBe("sent");
    expect(sender.mint).toBe(NATIVE_SOL_MINT);
    // -1 SOL exactly, fee added back.
    expect(sender.amountLabel).toBe("-1");
    expect(sender.blockTime).toBe(1_700_000_000);

    const recipient = rows.find((r) => r.walletAddress === RECIPIENT)!;
    expect(recipient.kind).toBe("received");
    expect(recipient.amountLabel).toBe("+1");

    // Detail: fee is attributed to the payer's row only, and every row is
    // stamped with the parser version for future re-parsing.
    expect(sender.detail?.feeLamports).toBe(5000);
    expect(sender.parserVersion).toBe(WALLET_ACTIVITY_PARSER_VERSION);
    expect(recipient.detail).toBeNull();
  });

  it("indexes a token receive via ATA owner even without an account-key delta", () => {
    const rows = activityRowsFromResult(
      result({
        transaction: {
          signatures: [SIG],
          message: { accountKeys: [] },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              owner: RECIPIENT,
              mint: USDC,
              uiTokenAmount: { uiAmount: 10, decimals: 6, amount: "10000000" },
            },
          ],
          postTokenBalances: [
            {
              owner: RECIPIENT,
              mint: USDC,
              uiTokenAmount: { uiAmount: 25, decimals: 6, amount: "25000000" },
            },
          ],
        },
      }),
      1_700_000_000
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.walletAddress).toBe(RECIPIENT);
    expect(rows[0]!.kind).toBe("received");
    expect(rows[0]!.mint).toBe(USDC);
    expect(rows[0]!.amountLabel).toBe("+15");
  });

  it("keeps a failed tx in the fee payer's history", () => {
    const rows = activityRowsFromResult(
      result({
        transaction: {
          signatures: [SIG],
          message: { accountKeys: [{ pubkey: SENDER }] },
        },
        meta: {
          err: { InstructionError: [0, "Custom"] },
          fee: 5000,
          preBalances: [2_000_000_000],
          postBalances: [1_999_995_000],
        },
      }),
      1_700_000_000
    );

    const row = rows.find((r) => r.walletAddress === SENDER)!;
    expect(row.kind).toBe("failed");
    expect(row.failed).toBe(true);
    expect(row.statusLabel).toBe("Failed");
    expect(row.title).toBe("Failed");
  });

  it("falls back to receivedAt when the result has no blockTime", () => {
    const rows = activityRowsFromResult(
      result({
        transaction: {
          signatures: [SIG],
          message: { accountKeys: [{ pubkey: SENDER }, { pubkey: RECIPIENT }] },
        },
        meta: {
          preBalances: [2_000_000_000, 0],
          postBalances: [1_000_000_000, 1_000_000_000],
        },
      }),
      1_699_999_999
    );
    expect(rows[0]!.blockTime).toBe(1_699_999_999);
  });

  it("returns nothing when there is no confirmed transaction", () => {
    expect(activityRowsFromResult({ signature: SIG }, 1)).toEqual([]);
  });
});
