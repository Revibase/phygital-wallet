import {
  AccountRole,
  downgradeRoleToNonSigner,
  isSignerRole,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";
import { PHYGITAL_WALLET_PROGRAM_ADDRESS } from "../generated/programs/phygitalWallet.js";

const DENIED_PROGRAMS = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

function remainingAccountKey(meta: AccountMeta): string {
  return `${meta.address}:${meta.role}`;
}

function getOrInsertRemainingAccount(
  remainingAccounts: AccountMeta[],
  indexByKey: Map<string, number>,
  meta: AccountMeta
): number {
  const key = remainingAccountKey(meta);
  const existing = indexByKey.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const index = remainingAccounts.length;
  remainingAccounts.push(meta);
  indexByKey.set(key, index);
  return index;
}

function downgradeWalletSignerRole(
  meta: AccountMeta,
  walletPda: Address
): AccountMeta {
  if (meta.address !== walletPda || !isSignerRole(meta.role)) {
    return meta;
  }
  return {
    address: meta.address,
    role: downgradeRoleToNonSigner(meta.role),
  };
}

/** Kit instructions → compact execute format; downgrades wallet PDA signer roles. */
export function compileWalletInstructions(
  instructions: readonly Instruction[],
  walletPda: Address
): {
  remainingAccounts: AccountMeta[];
  compactInstructions: CompactInstructionArgs[];
} {
  if (instructions.length === 0) {
    throw new Error("At least one inner instruction is required");
  }

  const remainingAccounts: AccountMeta[] = [];
  const indexByKey = new Map<string, number>();
  const compactInstructions: CompactInstructionArgs[] = [];

  for (const instruction of instructions) {
    const programAddress = instruction.programAddress;
    if (DENIED_PROGRAMS.has(programAddress)) {
      throw new Error(
        `Inner CPI to ${programAddress} is not allowed for wallet execute`
      );
    }

    const programIndex = getOrInsertRemainingAccount(
      remainingAccounts,
      indexByKey,
      { address: programAddress, role: AccountRole.READONLY }
    );

    const accountIndexes: number[] = [];
    for (const account of instruction.accounts ?? []) {
      const processed = downgradeWalletSignerRole(account, walletPda);
      accountIndexes.push(
        getOrInsertRemainingAccount(remainingAccounts, indexByKey, processed)
      );
    }

    compactInstructions.push({
      programIdIndex: programIndex,
      accountIndexes: Uint8Array.from(accountIndexes),
      data: instruction.data ?? new Uint8Array(),
    });
  }

  return { remainingAccounts, compactInstructions };
}
