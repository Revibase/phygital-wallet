import { AccountRole, address, type Instruction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { assertTopLevelInstructionAllowed } from "./decode-tx.js";
import { COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM } from "./constants.js";

const RECENT_BLOCKHASHES = "SysvarRecentB1ockHashes11111111111111111111";

function advanceNonceIx(): Instruction {
  return {
    programAddress: address(SYSTEM_PROGRAM),
    data: new Uint8Array([4, 0, 0, 0]),
    accounts: [
      {
        address: address("11111111111111111111111111111112"),
        role: AccountRole.WRITABLE,
      },
      {
        address: address(RECENT_BLOCKHASHES),
        role: AccountRole.READONLY,
      },
      {
        address: address("11111111111111111111111111111113"),
        role: AccountRole.READONLY_SIGNER,
      },
    ],
  };
}

describe("assertTopLevelInstructionAllowed", () => {
  it("allows AdvanceNonceAccount for System Program", () => {
    expect(() =>
      assertTopLevelInstructionAllowed(advanceNonceIx()),
    ).not.toThrow();
  });

  it("rejects other System Program instructions at top level", () => {
    const transfer: Instruction = {
      programAddress: address(SYSTEM_PROGRAM),
      data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
      accounts: [
        {
          address: address("11111111111111111111111111111112"),
          role: AccountRole.WRITABLE_SIGNER,
        },
        {
          address: address("11111111111111111111111111111113"),
          role: AccountRole.WRITABLE,
        },
      ],
    };
    expect(() => assertTopLevelInstructionAllowed(transfer)).toThrow(
      /Unexpected system program instruction/,
    );
  });

  it("allows Compute Budget", () => {
    expect(() =>
      assertTopLevelInstructionAllowed({
        programAddress: address(COMPUTE_BUDGET_PROGRAM),
        data: new Uint8Array([2, 0, 0, 0, 0]),
      }),
    ).not.toThrow();
  });

  it("rejects unknown programs", () => {
    expect(() =>
      assertTopLevelInstructionAllowed({
        programAddress: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        data: new Uint8Array([3]),
      }),
    ).toThrow(/Unexpected top-level program/);
  });
});
