import {
  AccountRole,
  downgradeRoleToNonSigner,
  isSignerRole,
  mergeRoles,
  upgradeRoleToSigner,
  upgradeRoleToWritable,
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

function getOrInsertRemainingAccount(
  remainingAccounts: AccountMeta[],
  indexByAddress: Map<string, number>,
  meta: AccountMeta
): number {
  const existing = indexByAddress.get(meta.address);
  if (existing !== undefined) {
    const current = remainingAccounts[existing]!;
    const merged = mergeRoles(current.role, meta.role);
    if (merged !== current.role) {
      remainingAccounts[existing] = { address: current.address, role: merged };
    }
    return existing;
  }
  const index = remainingAccounts.length;
  remainingAccounts.push(meta);
  indexByAddress.set(meta.address, index);
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

/**
 * OR remaining-account privileges with outer `execute` named accounts / fee payer
 * so the challenge `accounts_hash` matches on-chain `AccountInfo` flags.
 */
export function elevateRemainingForExecuteChallenge(
  remainingAccounts: readonly AccountMeta[],
  opts: {
    writableAddresses?: readonly Address[];
    signerAddresses?: readonly Address[];
  }
): AccountMeta[] {
  const writable = new Set(opts.writableAddresses ?? []);
  const signers = new Set(opts.signerAddresses ?? []);
  if (writable.size === 0 && signers.size === 0) {
    return [...remainingAccounts];
  }
  return remainingAccounts.map((meta) => {
    let role = meta.role;
    if (signers.has(meta.address)) role = upgradeRoleToSigner(role);
    if (writable.has(meta.address)) role = upgradeRoleToWritable(role);
    return role === meta.role ? meta : { address: meta.address, role };
  });
}

/**
 * Kit instructions → compact execute format; downgrades wallet PDA signer roles.
 * Remaining accounts are keyed by address with Kit `mergeRoles` so hashed flags
 * match Solana message-level elevation (including outer execute writables).
 */
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
  const indexByAddress = new Map<string, number>();
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
      indexByAddress,
      { address: programAddress, role: AccountRole.READONLY }
    );

    const accountIndexes: number[] = [];
    for (const account of instruction.accounts ?? []) {
      const processed = downgradeWalletSignerRole(account, walletPda);
      accountIndexes.push(
        getOrInsertRemainingAccount(remainingAccounts, indexByAddress, processed)
      );
    }

    compactInstructions.push({
      programIdIndex: programIndex,
      accountIndexes: Uint8Array.from(accountIndexes),
      data: instruction.data ?? new Uint8Array(),
    });
  }

  return {
    remainingAccounts: elevateRemainingForExecuteChallenge(remainingAccounts, {
      writableAddresses: [walletPda],
    }),
    compactInstructions,
  };
}
