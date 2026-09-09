/**
 * Standing policy document types + UI helpers (no Codama / verify graph).
 * Persistence validation lives in api-signer (`validatePaymentsPolicyConfig`).
 */

export const DEFAULT_MAX_MINT_RAW = "50000000" as const;
export const DEFAULT_MAX_SOL_LAMPORTS = "100000000" as const;

/** Per-mint fungible spend cap (raw token units). */
export type MintSpendLimit = {
  mint: string;
  maxRaw: string;
};

/**
 * Standing policy document — only what the app configures.
 * Built-in programs / collectibles are always allowed when this document exists.
 */
export type PaymentsPolicyConfig = {
  version: "3";
  /** Fungible spend caps keyed by mint. Absent/empty → no fungible mint caps. */
  mintLimits?: readonly MintSpendLimit[];
  /** SOL spend cap in lamports. Absent → uncapped SOL. */
  maxSolLamports?: string;
  /** Extra programs allowed without spend-cap checks. */
  extraPrograms?: readonly string[];
};

export function uiAmountToRaw(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || !Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError("uiAmountToRaw: ui must be finite and decimals >= 0");
  }
  const [whole, frac = ""] = String(ui).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const negative = whole.startsWith("-");
  const absWhole = negative ? whole.slice(1) : whole;
  const raw =
    BigInt(absWhole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -raw : raw;
}
