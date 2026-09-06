import { getD1 } from "@/shared/db";

export async function getFeeBalanceLamports(
  phygitalToken: string,
): Promise<number> {
  const row = await getD1()
    .prepare(
      `SELECT balance_lamports FROM token_fee_balances WHERE phygital_token = ?`,
    )
    .bind(phygitalToken)
    .first<{ balance_lamports: number }>();
  return row?.balance_lamports ?? 0;
}
