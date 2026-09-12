import { address, type Address } from "@solana/kit";

import { isMainnet } from "@/lib/solana/cluster";

/** Circle USDC (SPL Token), 6 decimals. */
export const USDC_MINT_MAINNET = address(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

/** Common Circulating / faucet USDC on Solana Devnet. */
export const USDC_MINT_DEVNET = address(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnm3"
);

export const USDC_DECIMALS = 6;

/** Cluster USDC mint, or `NEXT_PUBLIC_USDC_MINT` override. */
export function getUsdcMint(): Address {
  const override = process.env.NEXT_PUBLIC_USDC_MINT?.trim();
  if (override) return address(override);
  return isMainnet() ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
}
