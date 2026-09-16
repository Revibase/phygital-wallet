import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { requireSupportedTokenProgram } from "@/lib/tokens/payment-token";
import type { SendAssetRef } from "@/lib/wallet/send-asset-ref";

/** Classic SPL / Token-2022 base token account size (no account extensions). */
const BASE_TOKEN_ACCOUNT_SIZE = 165;

export type RecipientAtaFunding = {
  /** Destination ATA is missing and CreateIdempotent must fund rent. */
  needsCreate: boolean;
  /** Lamports the payer wallet must hold to create the recipient ATA. */
  rentLamports: bigint;
};

/**
 * Whether nearby/send must create the recipient ATA, and how much SOL rent the
 * payer wallet needs. Native SOL transfers skip ATA creation.
 */
export async function resolveRecipientAtaFunding(args: {
  recipientWallet: string;
  mint: string;
  tokenProgram: string | null;
  kind: SendAssetRef["kind"];
}): Promise<RecipientAtaFunding> {
  if (
    args.kind === "native" ||
    args.kind === "cnft" ||
    args.kind === "core"
  ) {
    return { needsCreate: false, rentLamports: 0n };
  }

  const tokenProgram = requireSupportedTokenProgram(args.tokenProgram);
  const mint = address(args.mint);
  const owner = address(args.recipientWallet);
  const [ata] = await findAssociatedTokenPda({ mint, owner, tokenProgram });

  const rpc = getSolanaRpc();
  const info = await rpc.getAccountInfo(ata, { encoding: "base64" }).send();
  if (info.value != null) {
    return { needsCreate: false, rentLamports: 0n };
  }

  const rentLamports = await rpc
    .getMinimumBalanceForRentExemption(BigInt(BASE_TOKEN_ACCOUNT_SIZE))
    .send();

  return { needsCreate: true, rentLamports };
}
