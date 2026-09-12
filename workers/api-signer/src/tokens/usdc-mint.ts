import { address, type Address } from "@solana/kit";

import { isMainnet } from "@/shared/solana/cluster";

/** Circle USDC (SPL Token), 6 decimals. */
const USDC_MINT_MAINNET = address(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

/** Common Circulating / faucet USDC on Solana Devnet. */
const USDC_MINT_DEVNET = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnm3");

export const USDC_DECIMALS = 6;

/** Cluster USDC mint, or `USDC_MINT` override. */
export function getUsdcMint(): Address {
  return isMainnet() ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
}
