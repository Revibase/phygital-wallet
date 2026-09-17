import {
  address,
  createNoopSigner,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

import { uiAmountToRaw } from "@/lib/tokens/amount";
import { walletPdaForToken } from "@/lib/wallet/pda";

function getTopUpAccumulator(): Address {
  const raw = process.env.NEXT_PUBLIC_TOP_UP_ACCUMULATOR?.trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_TOP_UP_ACCUMULATOR is not configured");
  }
  return address(raw);
}

/**
 * Body instructions for a fee top-up (`executeWithAuthority` only).
 * Token PDA is read from the outer execute instruction when crediting — no memo.
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
      amountUi: args.amountUi,
    }),
  };
}

function buildTopUpTransferInstructions(args: {
  source: TransactionSigner;
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
  ];
}
