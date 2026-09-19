/**
 * Prepaid fee-balance attempt floor for the fee payer.
 * Not a quote of post-wrap SOL spend — webhook debits actual spend after confirm.
 * At sign time we reserve this amount until settle (debit) or TTL release.
 */
export const MIN_ATTEMPT_FEE_LAMPORTS = 100_000;

/** Starter fee balance granted once when a token ledger is provisioned (~0.001 SOL). */
export const STARTER_FEE_BALANCE_LAMPORTS = 1_000_000;

/**
 * Cap open sign-time reserves per token. Limits fee-reserve griefing depth
 * without relying on edge rate limits (those live in the Cloudflare dashboard).
 */
export const MAX_CONCURRENT_FEE_RESERVES = 4;

/** How long a sign-time fee reserve stays open before alarm release. */
export const FEE_RESERVE_TTL_MS = 90_000;

export const SYSTEM_PROGRAM_ADDRESS =
  "11111111111111111111111111111111" as const;
