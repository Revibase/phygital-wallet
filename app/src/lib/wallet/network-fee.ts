/**
 * Prepaid fee-balance helpers — keep floors in sync with
 * `workers/api-signer/src/fees/constants.ts`.
 *
 * `MIN_ATTEMPT_FEE_LAMPORTS` is a minimum-to-attempt gate, not a quote of
 * post-wrap network spend (webhook debits actual SOL after confirm).
 */
export const MIN_ATTEMPT_FEE_LAMPORTS = 100_000;

/** Starter / “low balance” display floor (~0.001 SOL). */
export const FEE_BALANCE_LOW_LAMPORTS = 1_000_000;

export function lamportsToSolUi(lamports: number | bigint): string {
  const n = Number(lamports);
  if (!Number.isFinite(n)) return "0";
  return (n / 1e9).toFixed(9).replace(/\.?0+$/, "") || "0";
}
