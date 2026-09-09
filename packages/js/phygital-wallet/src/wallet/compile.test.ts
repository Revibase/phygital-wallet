import {
  AccountRole,
  address,
  type AccountMeta,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { compileWalletInstructions } from "./compile.js";

const WALLET_PDA = address("11111111111111111111111111111112");
const MINT = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const RECIPIENT = address("So11111111111111111111111111111111111111112");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

function mockInstruction(
  programAddress: typeof SYSTEM_PROGRAM,
  accounts: AccountMeta[],
  data: Uint8Array = new Uint8Array([2, 0, 0, 0]),
): Instruction {
  return {
    programAddress,
    accounts,
    data,
  };
}

describe("compileWalletInstructions", () => {
  it("downgrades wallet PDA signer role in remaining accounts", () => {
    const instructions = [
      mockInstruction(SYSTEM_PROGRAM, [
        { address: WALLET_PDA, role: AccountRole.WRITABLE_SIGNER },
        { address: RECIPIENT, role: AccountRole.WRITABLE },
      ]),
    ];

    const compiled = compileWalletInstructions(instructions, WALLET_PDA);

    expect(compiled.compactInstructions).toHaveLength(1);
    expect(compiled.compactInstructions[0]?.programIdIndex).toBe(0);
    expect(compiled.compactInstructions[0]?.accountIndexes).toEqual(
      Uint8Array.from([1, 2]),
    );

    const walletMeta = compiled.remainingAccounts[1];
    expect(walletMeta?.address).toBe(WALLET_PDA);
    expect(walletMeta?.role).toBe(AccountRole.WRITABLE);
  });

  it("keeps non-wallet signers as signers in remaining accounts", () => {
    const instructions = [
      mockInstruction(SYSTEM_PROGRAM, [
        { address: WALLET_PDA, role: AccountRole.WRITABLE_SIGNER },
        { address: MINT, role: AccountRole.WRITABLE_SIGNER },
        { address: RECIPIENT, role: AccountRole.WRITABLE },
      ]),
    ];

    const compiled = compileWalletInstructions(instructions, WALLET_PDA);
    const mintMeta = compiled.remainingAccounts.find((m) => m.address === MINT);
    expect(mintMeta?.role).toBe(AccountRole.WRITABLE_SIGNER);
  });

  it("dedupes remaining accounts with stable ordering", () => {
    const instructions = [
      mockInstruction(SYSTEM_PROGRAM, [
        { address: WALLET_PDA, role: AccountRole.WRITABLE_SIGNER },
        { address: RECIPIENT, role: AccountRole.WRITABLE },
      ]),
      mockInstruction(SYSTEM_PROGRAM, [
        { address: WALLET_PDA, role: AccountRole.WRITABLE },
        { address: RECIPIENT, role: AccountRole.WRITABLE },
      ]),
    ];

    const compiled = compileWalletInstructions(instructions, WALLET_PDA);
    expect(compiled.remainingAccounts).toHaveLength(3);

    const recomputed = compileWalletInstructions(instructions, WALLET_PDA);
    expect(recomputed.remainingAccounts).toEqual(compiled.remainingAccounts);
    expect(recomputed.compactInstructions).toEqual(compiled.compactInstructions);
  });

  it("rejects denied inner programs", () => {
    const instructions = [
      mockInstruction(
        address("Fjbi9JrRAmSBdxQxbkcxYDp6JUwnLbFhU2GsieWQBLSg"),
        [],
      ),
    ];
    expect(() =>
      compileWalletInstructions(instructions, WALLET_PDA),
    ).toThrow(/not allowed/);
  });
});
