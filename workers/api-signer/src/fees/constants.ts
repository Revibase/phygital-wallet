/** Conservative fee estimate for default-verifier fee balance. */
const FEE_BASE_LAMPORTS = 10_000;
const FEE_LAMPORTS_PER_IX = 5_000;

/** Starter fee balance granted once when a token ledger is created (~0.001 SOL). */
export const STARTER_FEE_BALANCE_LAMPORTS = 1_000_000;

export const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as const;

export function requiredFeeLamports(instructionCount: number): number {
  const n = Math.max(0, instructionCount);
  return FEE_BASE_LAMPORTS + FEE_LAMPORTS_PER_IX * n;
}
