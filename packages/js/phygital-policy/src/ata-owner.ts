/**
 * Resolve wallet owner for an ATA from sibling create / createIdempotent ixs.
 * Used inside TransferChecked `onFail` (full `ctx.instructions`).
 */
import type { Instruction } from "@solana/kit";
import { ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS } from "./adapters.js";

export function walletOwnerForAta(
  instructions: readonly Instruction[],
  ata: string,
  mint?: string | null
): string | null {
  const ataProgram = String(ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ADDRESS);
  for (const ix of instructions) {
    if (String(ix.programAddress) !== ataProgram) continue;
    const accounts = ix.accounts ?? [];
    // ATA create layout: [funder, associatedTokenAccount, wallet, mint, ...]
    const ataAccount = accounts[1]?.address;
    const wallet = accounts[2]?.address;
    const ixMint = accounts[3]?.address;
    if (!ataAccount || !wallet) continue;
    if (String(ataAccount) !== ata) continue;
    if (mint && ixMint && String(ixMint) !== mint) continue;
    return String(wallet);
  }
  return null;
}
