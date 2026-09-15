/**
 * Authority fallback for wallet spends the accessory's policy rejects.
 *
 * When `getPhygitalWalletSigner` (passkey + policy-checked `execute`) is denied
 * by policy and the connected wallet is the accessory's authority, the same body
 * instructions are re-executed via `executeWithAuthority`: the authority's
 * ed25519 signature bypasses the on-chain policy check, and the paymaster still
 * fee-pays. Mirrors `sendOwnerAuthorityTransaction`, but wraps *arbitrary* wallet
 * instructions (compacted via `compileWalletInstructions`) instead of a single
 * program-level authority instruction.
 */
import {
  address,
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
import { createHeliusSigner } from "@/lib/wallet/helius-signer";
import type { OwnerSigner } from "@/lib/wallet/owner-authority-tx";
import { walletPdaForToken } from "@/lib/wallet/pda";
import { appVerifierFetch } from "@/lib/wallet/verifier-fee-payer";

function withRemainingAccounts(
  instruction: Instruction,
  remainingAccounts: readonly AccountMeta[]
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
  owner: OwnerSigner;
  instructions: Instruction[];
  abortSignal?: AbortSignal;
}): Promise<SentTransaction> {
  const phygitalToken = address(String(args.phygitalToken));
  const walletPda = await walletPdaForToken(phygitalToken);
  const [authorityPda] = await findAuthorityAccountPda({ phygitalToken });

  const authoritySigner = createHeliusSigner(args.owner);
  const feePayer = await createDefaultFeePayer({ fetch: appVerifierFetch });

  const { compactInstructions, remainingAccounts } = compileWalletInstructions(
    args.instructions,
    walletPda
  );

  const executeIx = withRemainingAccounts(
    getExecuteWithAuthorityInstruction({
      authority: authoritySigner,
      phygitalToken,
      authorityAccount: authorityPda,
      wallet: walletPda,
      compactInstructions,
    }),
    remainingAccounts
  );

  return sendTransaction({
    instructions: [executeIx],
    feePayer,
    fetchBlockhash: true,
    applyResourceLimits: true,
    abortSignal: args.abortSignal,
  });
}
