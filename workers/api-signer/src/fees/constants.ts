/** Conservative fee estimate for default-verifier paymaster. */
const FEE_BASE_LAMPORTS = 10_000;
const FEE_LAMPORTS_PER_IX = 5_000;

export const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as const;

export function requiredFeeLamports(instructionCount: number): number {
  const n = Math.max(0, instructionCount);
  return FEE_BASE_LAMPORTS + FEE_LAMPORTS_PER_IX * n;
}
