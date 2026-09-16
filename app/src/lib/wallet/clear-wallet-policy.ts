/**
 * Clear the on-chain spend policy (`clear_wallet_policy`) — drops all caps while
 * keeping the owner (the accessory stays enabled; distinct from `clear_authority`
 * which removes the owner). Owner-signed, paymaster-fee-paid.
 */
import { getClearWalletPolicyInstruction } from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";
import { sendOwnerAuthorityTransaction } from "@/lib/wallet/owner-authority-tx";
import { TransactionPartialSigner } from "@solana/kit";

export async function clearWalletPolicy(args: {
  phygitalToken: string;
  authority: TransactionPartialSigner;
}): Promise<SentTransaction> {
  return sendOwnerAuthorityTransaction({
    phygitalToken: args.phygitalToken,
    authority: args.authority,
    build: ({ authoritySigner, phygitalToken, authorityPda, rentReceiver }) =>
      getClearWalletPolicyInstruction({
        authority: authoritySigner,
        rentReceiver,
        phygitalToken,
        authorityAccount: authorityPda,
      }),
  });
}
