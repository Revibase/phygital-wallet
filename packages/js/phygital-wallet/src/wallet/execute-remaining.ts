import { PhygitalWalletInstruction } from "../generated/programs/index.js";

/**
 * Named-account counts before `remaining_accounts` on each execute* variant.
 *
 * CompactInstruction `programIdIndex` / `accountIndexes` address into that
 * remaining slice only (on-chain `ctx.remaining_accounts`). Decoders that
 * expand compact CPI MUST slice with these offsets — not the full account list.
 *
 * Layouts (Codama / Anchor):
 * - `execute`: token, wallet, authority, slotHashes, ixSysvar, tokenProgram
 * - `executeWithAuthority` / `…UsingPolicies`: authority, token, authorityAccount, wallet, ixSysvar
 */
export const EXECUTE_NAMED_ACCOUNT_COUNT = 6;
export const EXECUTE_WITH_AUTHORITY_NAMED_ACCOUNT_COUNT = 5;

/** Named-account count before remaining, or `null` when the ix has no compact CPI. */
export function executeRemainingAccountOffset(
  kind: PhygitalWalletInstruction,
): number | null {
  switch (kind) {
    case PhygitalWalletInstruction.Execute:
      return EXECUTE_NAMED_ACCOUNT_COUNT;
    case PhygitalWalletInstruction.ExecuteWithAuthority:
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
      return EXECUTE_WITH_AUTHORITY_NAMED_ACCOUNT_COUNT;
    default:
      return null;
  }
}

/**
 * Slice `remaining_accounts` for an execute* instruction's full account metas.
 * Throws when `kind` is not an execute variant with compact CPI.
 */
export function sliceExecuteRemainingAccounts<T>(
  kind: PhygitalWalletInstruction,
  accounts: readonly T[],
): readonly T[] {
  const offset = executeRemainingAccountOffset(kind);
  if (offset == null) {
    throw new Error(
      `Instruction ${PhygitalWalletInstruction[kind] ?? kind} has no compact remaining accounts`,
    );
  }
  return accounts.slice(offset);
}
