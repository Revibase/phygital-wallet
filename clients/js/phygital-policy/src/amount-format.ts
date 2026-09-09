/** Shared amount / known-mint helpers (no policy imports — avoid cycles). */

export const SOL_DECIMALS = 9;

/** Circle USDC mainnet. */
export const USDC_MINT_MAINNET =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const;

/** Common Circulating / faucet USDC on Solana Devnet. */
export const USDC_MINT_DEVNET =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnm3" as const;

const KNOWN_USDC_MINTS = new Set<string>([
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
]);

export function formatUiAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const formatted = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

export function isUsdcMint(mint: string | null | undefined): boolean {
  return mint != null && KNOWN_USDC_MINTS.has(mint);
}
