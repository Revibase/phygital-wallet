import { getBase58Decoder } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  getExecuteInstructionDataEncoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { describe, expect, it } from "vitest";

import {
  decodeMemoText,
  findExecuteAccounts,
  findMemoPhygitalToken,
  resolveAccountKeys,
} from "./subscribe-fee-tx";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOP_UP_TOKEN = "VfgEdk1FVy2KNanqguZKvJ8M67uxWwx8BGyqzJw6rvZ";
const VERIFIER = "2qLZosEYxN4Bp7dGySYgjWEmXR9jQ4za6hr2AFocUHxU";
const DUMMY = "11111111111111111111111111111111";
const ACCUMULATOR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const b58 = getBase58Decoder();

describe("decodeMemoText", () => {
  it("accepts a utf8 pubkey", () => {
    expect(decodeMemoText(TOKEN)).toBe(TOKEN);
  });

  it("decodes the on-chain memo data from a wrapped top-up", () => {
    expect(
      decodeMemoText(
        "7N9Q1HcLHdHhqkW49kM14no6buwY5Uv6friZQdTAhjRkFxEfTPZRYG1FDLD",
      ),
    ).toBe(TOP_UP_TOKEN);
  });

  it("decodes base64 instruction data", () => {
    const data = btoa(TOKEN);
    expect(decodeMemoText(data)).toBe(TOKEN);
  });
});

describe("resolveAccountKeys", () => {
  it("appends loadedAddresses after static keys", () => {
    expect(
      resolveAccountKeys({
        transaction: {
          message: {
            accountKeys: [{ pubkey: VERIFIER }, { pubkey: DUMMY }],
          },
        },
        meta: {
          loadedAddresses: {
            writable: [ACCUMULATOR],
            readonly: [TOKEN],
          },
        },
      }),
    ).toEqual([VERIFIER, DUMMY, ACCUMULATOR, TOKEN]);
  });
});

describe("findExecuteAccounts / findMemoPhygitalToken", () => {
  const executeData = b58.decode(
    getExecuteInstructionDataEncoder().encode({
      compactInstructions: [],
      secp256r1VerifyArgs: {
        verifyArgsRelativeIndex: 0,
        signedMessageIndex: 0,
        clientDataJson: new Uint8Array(),
      },
      slotNumber: 0n,
    }),
  );

  // accountKeys layout for compiled ixs:
  // 0 fee payer, 1..5 execute accounts (token first), 6 memo program, 7 wallet program
  const keys = [
    VERIFIER,
    TOP_UP_TOKEN,
    DUMMY,
    DUMMY,
    DUMMY,
    DUMMY,
    MEMO_PROGRAM_ADDRESS,
    PHYGITAL_WALLET_PROGRAM_ADDRESS,
  ];

  const confirmed = {
    transaction: {
      message: {
        accountKeys: keys.map((pubkey) => ({ pubkey })),
        instructions: [
          {
            programIdIndex: 7,
            accounts: [1, 2, 3, 4, 5, 0],
            data: executeData,
          },
          {
            programIdIndex: 6,
            accounts: [],
            data: "7N9Q1HcLHdHhqkW49kM14no6buwY5Uv6friZQdTAhjRkFxEfTPZRYG1FDLD",
          },
        ],
      },
    },
    meta: { err: null },
  };

  it("reads phygitalToken via the generated execute decoder", () => {
    expect(findExecuteAccounts(confirmed, keys)).toEqual({
      phygitalToken: TOP_UP_TOKEN,
    });
  });

  it("reads phygitalToken from a memo instruction", () => {
    expect(findMemoPhygitalToken(confirmed, keys)).toBe(TOP_UP_TOKEN);
  });

  it("ignores wallet instructions that are not execute", () => {
    const initData = b58.decode(
      new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70]),
    );
    expect(
      findExecuteAccounts(
        {
          transaction: {
            message: {
              accountKeys: keys.map((pubkey) => ({ pubkey })),
              instructions: [
                {
                  programIdIndex: 7,
                  accounts: [0, 2, 1, 3, 4, 5, 2, 2],
                  data: initData,
                },
              ],
            },
          },
          meta: { err: null },
        },
        keys,
      ),
    ).toBeNull();
  });

  it("finds execute nested under innerInstructions", () => {
    expect(
      findExecuteAccounts(
        {
          transaction: {
            message: {
              accountKeys: keys.map((pubkey) => ({ pubkey })),
              instructions: [],
            },
          },
          meta: {
            err: null,
            innerInstructions: [
              {
                index: 0,
                instructions: [
                  {
                    programIdIndex: 7,
                    accounts: [1, 2, 3, 4, 5, 0],
                    data: executeData,
                  },
                ],
              },
            ],
          },
        },
        keys,
      ),
    ).toEqual({ phygitalToken: TOP_UP_TOKEN });
  });
});
