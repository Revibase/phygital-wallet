/**
 * Unlink an accessory = on-chain `clear_authority`, removing the owner and
 * disabling the accessory until it is claimed again (re-`set_authority`).
 *
 * No accessory tap: `clear_authority` is authorized by the current authority
 * (the signed-in Helius WaaS owner). Paymaster-fee-paid; rent refunded to the
 * Authority account's original payer. See `sendOwnerAuthorityTransaction`.
 */
import { getClearAuthorityInstruction } from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";
import { sendOwnerAuthorityTransaction } from "@/lib/wallet/owner-authority-tx";
import { TransactionPartialSigner } from "@solana/kit";

export async function unlinkAccessory(args: {
  phygitalToken: string;
  owner: TransactionPartialSigner;
}): Promise<SentTransaction> {
  return sendOwnerAuthorityTransaction({
    phygitalToken: args.phygitalToken,
    owner: args.owner,
    build: ({ authoritySigner, phygitalToken, authorityPda, rentReceiver }) =>
      getClearAuthorityInstruction({
        authority: authoritySigner,
        phygitalToken,
        rentReceiver,
        authorityAccount: authorityPda,
      }),
  });
}
