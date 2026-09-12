import type { WalletActivityType } from "@/lib/wallet/portfolio-types";

/** Human label for a parsed transaction category. */
const TYPE_LABELS: Record<WalletActivityType, string> = {
  transfer: "Transfer",
  swap: "Swap",
  nft_sale: "NFT sale",
  nft_mint: "NFT mint",
  nft_transfer: "NFT transfer",
  stake: "Stake",
  unstake: "Unstake",
  burn: "Burn",
  program_interaction: "App interaction",
  unknown: "Transaction",
};

export function activityTypeLabel(
  type: WalletActivityType | undefined | null
): string | null {
  if (!type) return null;
  return TYPE_LABELS[type] ?? null;
}

/** Format a lamports fee as a compact SOL string, e.g. "0.000005 SOL". */
export function formatFeeSol(
  lamports: number | null | undefined
): string | null {
  if (
    typeof lamports !== "number" ||
    !Number.isFinite(lamports) ||
    lamports <= 0
  ) {
    return null;
  }
  const sol = lamports / 1e9;
  const text = sol.toFixed(9).replace(/\.?0+$/, "");
  return `${text || "0"} SOL`;
}
