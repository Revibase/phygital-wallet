import {
  address,
  TransactionPartialSigner,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  compileWalletInstructions,
  createDefaultFeePayer,
  findAuthorityAccountPda,
  getExecuteWithAuthorityInstruction,
} from "phygital-wallet-sdk";

import { sendTransaction, type SentTransaction } from "@/lib/solana/tx";
import { walletPdaForToken } from "@/lib/wallet/pda";
import { appFeePayerApiFetch } from "@/lib/wallet/fee-payer-api-fetch";

function withRemainingAccounts(
  instruction: Instruction,
  remainingAccounts: readonly AccountMeta[],
): Instruction {
  return {
    ...instruction,
    accounts: [...(instruction.accounts ?? []), ...remainingAccounts],
  };
}

/**
 * Execute `instructions` from the wallet PDA via `executeWithAuthority`, signed
 * by the connected authority wallet and fee-paid by the paymaster. Returns as
 * soon as the RPC accepts the tx (same contract as `sendAssetFromWallet`).
 */
export async function sendViaAuthority(args: {
  phygitalToken: Address | string;
  authority: TransactionPartialSigner;
  instructions: Instruction[];
  abortSignal?: AbortSignal;
}): Promise<SentTransaction> {
  const phygitalToken = address(String(args.phygitalToken));
  const walletPda = await walletPdaForToken(phygitalToken);
  const [authorityPda] = await findAuthorityAccountPda({ phygitalToken });
  const feePayer = await createDefaultFeePayer({ fetch: appFeePayerApiFetch });

  const { compactInstructions, remainingAccounts } = compileWalletInstructions(
    args.instructions,
    walletPda,
  );

  const executeIx = withRemainingAccounts(
    getExecuteWithAuthorityInstruction({
      authority: args.authority,
      phygitalToken,
      authorityAccount: authorityPda,
      wallet: walletPda,
      compactInstructions,
    }),
    remainingAccounts,
  );

  return sendTransaction({
    instructions: [executeIx],
    feePayer,
    fetchBlockhash: true,
    abortSignal: args.abortSignal,
  });
}
