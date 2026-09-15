/**
 * Set the on-chain spend policy (`set_wallet_policy`) — a SOL/WSOL cap and/or
 * per-mint caps, each with a rolling window (`windowSeconds` 0 = lifetime budget,
 * >0 = recurring period). Owner-signed, paymaster-fee-paid.
 *
 * An unchanged cap keeps its remaining usage; changing a cap's amount or window
 * refills + reanchors it. Both WSOL mints belong to the SOL cap and are rejected
 * in `mintCaps`.
 */
import { address, TransactionPartialSigner } from "@solana/kit";
import {
  getSetWalletPolicyInstruction,
  type ProgramPermissionArgs,
} from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";
import { sendOwnerAuthorityTransaction } from "@/lib/wallet/owner-authority-tx";

/** Amounts are raw base units (lamports for SOL); `windowSeconds` 0 = lifetime. */
export type SolCapInput = { cap: bigint; windowSeconds: bigint };
export type MintCapInput = {
  mint: string;
  cap: bigint;
  windowSeconds: bigint;
};

export async function setWalletPolicy(args: {
  phygitalToken: string;
  owner: TransactionPartialSigner;
  /** null clears the SOL cap; omit to also clear it. */
  solCap?: SolCapInput | null;
  mintCaps?: MintCapInput[];
  /** Per-program overrides; empty (default) = fixed baseline only. */
  programPermissions?: ProgramPermissionArgs[];
}): Promise<SentTransaction> {
  return sendOwnerAuthorityTransaction({
    phygitalToken: args.phygitalToken,
    owner: args.owner,
    build: ({
      authoritySigner,
      feePayer,
      phygitalToken,
      authorityPda,
      rentReceiver,
    }) =>
      getSetWalletPolicyInstruction({
        authority: authoritySigner,
        payer: feePayer,
        rentReceiver,
        phygitalToken,
        authorityAccount: authorityPda,
        solCap: args.solCap ?? null,
        mintCaps: (args.mintCaps ?? []).map((m) => ({
          mint: address(m.mint),
          cap: m.cap,
          windowSeconds: m.windowSeconds,
        })),
        programPermissions: args.programPermissions ?? [],
      }),
  });
}
