/** Display / “low balance” floor (~0.001 SOL). */
export const FEE_BALANCE_LOW_LAMPORTS = 1_000_000;

export const MEMO_PROGRAM_ADDRESS =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as const;

export function lamportsToSolUi(lamports: number | bigint): string {
  const n = Number(lamports);
  if (!Number.isFinite(n)) return "0";
  return (n / 1e9).toFixed(9).replace(/\.?0+$/, "") || "0";
}
