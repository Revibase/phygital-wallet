import type { Instruction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS } from "./adapters.js";
import { walletOwnerForAta } from "./ata-owner.js";

const ATA = "11111111111111111111111111111113";
const OWNER = "11111111111111111111111111111114";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FUNDER = "11111111111111111111111111111112";

function ataCreateIx(): Instruction {
  return {
    programAddress:
      ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS as Instruction["programAddress"],
    data: new Uint8Array([0]),
    accounts: [
      { address: FUNDER as Instruction["programAddress"], role: 3 },
      { address: ATA as Instruction["programAddress"], role: 1 },
      { address: OWNER as Instruction["programAddress"], role: 0 },
      { address: MINT as Instruction["programAddress"], role: 0 },
    ],
  };
}

describe("walletOwnerForAta", () => {
  it("returns owner from sibling ATA create", () => {
    expect(walletOwnerForAta([ataCreateIx()], ATA, MINT)).toBe(OWNER);
  });

  it("returns null when ATA is missing", () => {
    expect(walletOwnerForAta([ataCreateIx()], "nope", MINT)).toBeNull();
  });
});
