/**
 * Prepaid fee-balance attempt floor for default-verifier paymaster.
 * Not a quote of post-wrap SOL spend — webhook debits actual spend after confirm.
 */
export const MIN_ATTEMPT_FEE_LAMPORTS = 100_000;

/** Starter fee balance granted once when a token ledger is created (~0.001 SOL). */
export const STARTER_FEE_BALANCE_LAMPORTS = 1_000_000;

export const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as const;
