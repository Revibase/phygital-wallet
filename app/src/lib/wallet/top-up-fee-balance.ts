import {
  address,
  type Address,
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
import { appVerifierFetch } from "@/lib/wallet/verifier-fee-payer";
import { accessTokenFor } from "@/lib/wallet/verifier-session";

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
  const accumulator = getTopUpAccumulator();
  args.signer?.onPhaseChange?.("preparing");
  const walletSigner = await getPhygitalWalletSigner(rpc, tokenPda, {
    ...args.signer,
    fetch: appVerifierFetch,
    getAccessToken: accessTokenFor(String(tokenPda)),
  });

  const lamports = uiAmountToRaw(args.amountUi, 9);
  if (lamports <= 0n) {
    throw new Error("Top-up amount must be greater than zero");
  }

  return sendTransaction({
    instructions: [
      getTransferSolInstruction({
        source: walletSigner,
        destination: accumulator,
        amount: lamports,
      }),
      getMemoInstruction(String(tokenPda)),
    ],
    feePayer: walletSigner,
    fetchBlockhash: false,
  });
}
