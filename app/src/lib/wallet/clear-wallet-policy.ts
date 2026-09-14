/**
 * Clear the on-chain spend policy (`clear_wallet_policy`) — drops all caps while
 * keeping the owner (the accessory stays enabled; distinct from `clear_authority`
 * which removes the owner). Owner-signed, paymaster-fee-paid.
 */
import { getClearWalletPolicyInstruction } from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";
import {
  sendOwnerAuthorityTransaction,
  type OwnerSigner,
} from "@/lib/wallet/owner-authority-tx";

export async function clearWalletPolicy(args: {
  phygitalToken: string;
  owner: OwnerSigner;
}): Promise<SentTransaction> {
  return sendOwnerAuthorityTransaction({
    phygitalToken: args.phygitalToken,
    owner: args.owner,
    build: ({ authoritySigner, phygitalToken, authorityPda, rentReceiver }) =>
      getClearWalletPolicyInstruction({
        authority: authoritySigner,
        rentReceiver,
        phygitalToken,
        authorityAccount: authorityPda,
      }),
  });
}
