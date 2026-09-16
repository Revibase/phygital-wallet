import { copy } from "@/lib/copy/phygital";
import { formatUsd } from "@/lib/currency/usd";
import { formatTokenAmount } from "@/lib/tokens/amount";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";

/** SOL has 9 decimals; spend caps are stored in lamports. */
export const SOL_DECIMALS = 9;

/**
 * Native SOL + both WSOL mints are metered by the unified SOL cap and are
 * REJECTED by the program in per-mint caps, so the token picker excludes them.
 */
const WSOL_MINT_2022 = "9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP";
export const SOL_LIKE_MINTS = new Set<string>([
  NATIVE_SOL_MINT,
  WSOL_MINT_2022,
]);

export function isSolLikeMint(mint: string): boolean {
  return SOL_LIKE_MINTS.has(mint);
}

/** Rolling-window presets, in seconds. `0` = lifetime (non-resetting). */
export const POLICY_WINDOW_PRESETS = [
  { seconds: 86_400n, label: copy.wallet.policyWindowDay },
  { seconds: 604_800n, label: copy.wallet.policyWindowWeek },
  { seconds: 2_592_000n, label: copy.wallet.policyWindowMonth },
  { seconds: 0n, label: copy.wallet.policyWindowLifetime },
] as const;

/** Human label for a window in seconds (falls back to lifetime). */
export function windowLabel(windowSeconds: bigint): string {
  const preset = POLICY_WINDOW_PRESETS.find((p) => p.seconds === windowSeconds);
  return preset?.label ?? copy.wallet.policyWindowLifetime;
}

/** Lowercased window label for mid-sentence use, e.g. "every week". */
export function windowPhrase(windowSeconds: bigint): string {
  return windowLabel(windowSeconds).toLowerCase();
}

/** Format lamports as a plain SOL string (full precision, trailing zeros trimmed). */
export function lamportsToSol(lamports: bigint): string {
  return formatTokenAmount(lamports, SOL_DECIMALS);
}

/** Short calendar date, e.g. "Sep 22". */
export function formatResetDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The next reset time for a recurring cap (`lastReset + windowSeconds`), or null
 * for a one-time (lifetime) budget that never resets.
 */
export function nextResetDate(
  lastReset: bigint,
  windowSeconds: bigint,
): string | null {
  if (windowSeconds === 0n) return null;
  return formatResetDate(lastReset + windowSeconds);
}
