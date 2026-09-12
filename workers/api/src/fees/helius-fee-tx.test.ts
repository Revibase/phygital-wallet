import { getBase58Decoder } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  getExecuteInstructionDataEncoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { describe, expect, it } from "vitest";

import { decodeMemoText, findExecuteAccounts } from "./helius-fee-tx";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOP_UP_TOKEN = "VfgEdk1FVy2KNanqguZKvJ8M67uxWwx8BGyqzJw6rvZ";
const VERIFIER = "2qLZosEYxN4Bp7dGySYgjWEmXR9jQ4za6hr2AFocUHxU";
const DUMMY = "11111111111111111111111111111111";
const b58 = getBase58Decoder();

describe("decodeMemoText", () => {
  it("accepts a utf8 pubkey", () => {
    expect(decodeMemoText(TOKEN)).toBe(TOKEN);
  });

  it("decodes the on-chain memo data from a wrapped top-up", () => {
    expect(
      decodeMemoText(
        "7N9Q1HcLHdHhqkW49kM14no6buwY5Uv6friZQdTAhjRkFxEfTPZRYG1FDLD"
      )
    ).toBe(TOP_UP_TOKEN);
  });

  it("decodes base64 instruction data", () => {
    const data = btoa(TOKEN);
    expect(decodeMemoText(data)).toBe(TOKEN);
  });
});

describe("findExecuteAccounts", () => {
  it("reads verifier and phygitalToken via the generated execute decoder", () => {
    const data = b58.decode(
      getExecuteInstructionDataEncoder().encode({
        compactInstructions: [],
        secp256r1VerifyArgs: {
          verifyArgsRelativeIndex: 0,
          signedMessageIndex: 0,
          clientDataJson: new Uint8Array(),
        },
        slotNumber: 0n,
      })
    );

    expect(
      findExecuteAccounts({
        instructions: [
          {
            programId: PHYGITAL_WALLET_PROGRAM_ADDRESS,
            accounts: [
              VERIFIER,
              DUMMY,
              TOP_UP_TOKEN,
              DUMMY,
              DUMMY,
              DUMMY,
              DUMMY,
              DUMMY,
            ],
            data,
          },
          {
            programId: MEMO_PROGRAM_ADDRESS,
            data: "7N9Q1HcLHdHhqkW49kM14no6buwY5Uv6friZQdTAhjRkFxEfTPZRYG1FDLD",
          },
        ],
      })
    ).toEqual({ verifier: VERIFIER, phygitalToken: TOP_UP_TOKEN });
  });

  it("ignores wallet instructions that are not execute", () => {
    expect(
      findExecuteAccounts({
        instructions: [
          {
            programId: PHYGITAL_WALLET_PROGRAM_ADDRESS,
            accounts: [
              VERIFIER,
              DUMMY,
              TOP_UP_TOKEN,
              DUMMY,
              DUMMY,
              DUMMY,
              DUMMY,
              DUMMY,
            ],
            // initialize_config discriminator
            data: b58.decode(
              new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70])
            ),
          },
        ],
      })
    ).toBeNull();
  });
});
