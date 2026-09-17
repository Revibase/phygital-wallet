import { getBase58Decoder } from "@solana/kit";
import {
  getExecuteInstructionDataEncoder,
  getExecuteWithAuthorityInstructionDataEncoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { describe, expect, it } from "vitest";

import { findExecuteAccounts, resolveAccountKeys } from "./subscribe-fee-tx";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOP_UP_TOKEN = "VfgEdk1FVy2KNanqguZKvJ8M67uxWwx8BGyqzJw6rvZ";
const VERIFIER = "2qLZosEYxN4Bp7dGySYgjWEmXR9jQ4za6hr2AFocUHxU";
const DUMMY = "11111111111111111111111111111111";
const ACCUMULATOR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const b58 = getBase58Decoder();

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

describe("findExecuteAccounts", () => {
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

  const executeWithAuthorityData = b58.decode(
    getExecuteWithAuthorityInstructionDataEncoder().encode({
      compactInstructions: [],
    }),
  );

  // Execute: token is accounts[0] of the ix → key index 1
  // ExecuteWithAuthority: token is accounts[1] of the ix → key index 2
  const executeKeys = [
    VERIFIER,
    TOP_UP_TOKEN,
    DUMMY,
    DUMMY,
    DUMMY,
    DUMMY,
    PHYGITAL_WALLET_PROGRAM_ADDRESS,
  ];

  const authorityKeys = [
    VERIFIER,
    DUMMY, // authority
    TOP_UP_TOKEN,
    DUMMY, // authorityAccount
    DUMMY, // wallet
    DUMMY, // instructionsSysvar
    PHYGITAL_WALLET_PROGRAM_ADDRESS,
  ];

  it("reads phygitalToken via the generated execute decoder", () => {
    const confirmed = {
      transaction: {
        message: {
          accountKeys: executeKeys.map((pubkey) => ({ pubkey })),
          instructions: [
            {
              programIdIndex: 6,
              accounts: [1, 2, 3, 4, 5, 0],
              data: executeData,
            },
          ],
        },
      },
      meta: { err: null },
    };
    expect(findExecuteAccounts(confirmed, executeKeys)).toEqual({
      phygitalToken: TOP_UP_TOKEN,
    });
  });

  it("reads phygitalToken from executeWithAuthority", () => {
    const confirmed = {
      transaction: {
        message: {
          accountKeys: authorityKeys.map((pubkey) => ({ pubkey })),
          instructions: [
            {
              programIdIndex: 6,
              accounts: [1, 2, 3, 4, 5],
              data: executeWithAuthorityData,
            },
          ],
        },
      },
      meta: { err: null },
    };
    expect(findExecuteAccounts(confirmed, authorityKeys)).toEqual({
      phygitalToken: TOP_UP_TOKEN,
    });
  });

  it("ignores wallet instructions that are not execute variants", () => {
    const initData = b58.decode(
      new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70]),
    );
    expect(
      findExecuteAccounts(
        {
          transaction: {
            message: {
              accountKeys: executeKeys.map((pubkey) => ({ pubkey })),
              instructions: [
                {
                  programIdIndex: 6,
                  accounts: [0, 2, 1, 3, 4, 5, 2, 2],
                  data: initData,
                },
              ],
            },
          },
          meta: { err: null },
        },
        executeKeys,
      ),
    ).toBeNull();
  });

  it("finds execute nested under innerInstructions", () => {
    expect(
      findExecuteAccounts(
        {
          transaction: {
            message: {
              accountKeys: executeKeys.map((pubkey) => ({ pubkey })),
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
                    programIdIndex: 6,
                    accounts: [1, 2, 3, 4, 5, 0],
                    data: executeData,
                  },
                ],
              },
            ],
          },
        },
        executeKeys,
      ),
    ).toEqual({ phygitalToken: TOP_UP_TOKEN });
  });
});
