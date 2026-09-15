import {
  address,
  createNoopSigner,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  getPhygitalWalletSigner,
  type PhygitalWalletSignerCallbacks,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { sendTransaction } from "@/lib/solana/tx";
import { uiAmountToRaw } from "@/lib/tokens/amount";
import { getMemoInstruction } from "@/lib/wallet/memo";
import { walletPdaForToken } from "@/lib/wallet/pda";
import { appVerifierFetch } from "@/lib/wallet/verifier-fee-payer";

function getTopUpAccumulator(): Address {
  const raw = process.env.NEXT_PUBLIC_TOP_UP_ACCUMULATOR?.trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_TOP_UP_ACCUMULATOR is not configured");
  }
  return address(raw);
}

/**
 * Top up fee balance: SOL → accumulator + memo = phygitalToken.
 * Exempt from fee-balance gate on the API.
 */
export async function topUpFeeBalance(args: {
  phygitalTokenPda: Address | string;
  amountUi: string;
  signer?: PhygitalWalletSignerCallbacks;
}): Promise<{ signature: string; confirmed: Promise<void> }> {
  const rpc = getSolanaRpc();
  const tokenPda = address(String(args.phygitalTokenPda));
  args.signer?.onPhaseChange?.("preparing");
  const walletSigner = await getPhygitalWalletSigner(rpc, tokenPda, {
    ...args.signer,
    fetch: appVerifierFetch,
  });

  return sendTransaction({
    instructions: buildTopUpTransferInstructions({
      source: walletSigner,
      tokenPda,
      amountUi: args.amountUi,
    }),
    feePayer: walletSigner,
    fetchBlockhash: false,
  });
}

/** SOL → accumulator + memo instructions, decoupled from the signer. */
function buildTopUpTransferInstructions(args: {
  source: TransactionSigner;
  tokenPda: Address;
  amountUi: string;
}): Instruction[] {
  const lamports = uiAmountToRaw(args.amountUi, 9);
  if (lamports <= 0n) {
    throw new Error("Top-up amount must be greater than zero");
  }
  return [
    getTransferSolInstruction({
      source: args.source,
      destination: getTopUpAccumulator(),
      amount: lamports,
    }),
    getMemoInstruction(String(args.tokenPda)),
  ];
}

/**
 * Body instructions for a fee top-up, decoupled from the signer, for the
 * authority fallback (`sendViaAuthority`) when policy denies the passkey path.
 */
export async function buildTopUpInstructions(args: {
  phygitalTokenPda: Address | string;
  amountUi: string;
}): Promise<{ walletPda: Address; instructions: Instruction[] }> {
  const tokenPda = address(String(args.phygitalTokenPda));
  const walletPda = await walletPdaForToken(tokenPda);
  return {
    walletPda,
    instructions: buildTopUpTransferInstructions({
      source: createNoopSigner(walletPda),
      tokenPda,
      amountUi: args.amountUi,
    }),
  };
}
