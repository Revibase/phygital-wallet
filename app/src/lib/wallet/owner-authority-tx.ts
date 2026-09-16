/**
 * Shared builder for owner/authority-signed, paymaster-fee-paid transactions
 * (unlink, set/clear wallet policy). The signed-in Helius WaaS owner co-signs as
 * `authority`; the paymaster is the fee payer and co-signs via `/sign`. Rent for
 * account growth/shrink is refunded to the Authority account's original payer.
 */
import {
  address,
  type Address,
  type Instruction,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  createDefaultFeePayer,
  fetchAuthority,
  findAuthorityAccountPda,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { sendTransaction, type SentTransaction } from "@/lib/solana/tx";
import { appFeePayerApiFetch } from "@/lib/wallet/fee-payer-api-fetch";

export type OwnerAuthorityContext = {
  authoritySigner: TransactionPartialSigner<Address>;
  feePayer: TransactionPartialSigner<Address>;
  phygitalToken: Address;
  authorityPda: Address;
  /** Original payer of the Authority account — the rent-refund target. */
  rentReceiver: Address;
};

export async function sendOwnerAuthorityTransaction(args: {
  phygitalToken: string;
  owner: TransactionPartialSigner;
  build: (ctx: OwnerAuthorityContext) => Instruction;
}): Promise<SentTransaction> {
  const rpc = getSolanaRpc();
  const phygitalToken = address(args.phygitalToken);
  const [authorityPda] = await findAuthorityAccountPda({ phygitalToken });
  const account = await fetchAuthority(rpc, authorityPda);

  const feePayer = await createDefaultFeePayer({ fetch: appFeePayerApiFetch });

  const built = args.build({
    authoritySigner: args.owner,
    feePayer,
    phygitalToken,
    authorityPda,
    rentReceiver: account.data.header.payer,
  });

  return sendTransaction({
    instructions: [built],
    feePayer,
    fetchBlockhash: true,
    applyResourceLimits: true,
  });
}
