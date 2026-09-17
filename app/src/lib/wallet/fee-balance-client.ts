import { queryFetch, readJson } from "@/lib/queries/http";

export type FeeBalance = {
  balanceLamports: number;
  balanceUi: string;
  low: boolean;
};

export async function fetchFeeBalance(
  phygitalToken: string
): Promise<FeeBalance> {
  const res = await queryFetch(
    `/tokens/fee-balance?phygitalToken=${encodeURIComponent(phygitalToken)}`
  );
  const data = await readJson<{
    balanceLamports?: string | number;
    availableLamports?: string | number;
    balanceUi?: string;
    low?: boolean;
  }>(res, "Couldn’t load fee balance");

  const preferred =
    data.availableLamports != null
      ? Number(data.availableLamports)
      : Number(data.balanceLamports ?? 0);
  const balanceLamports = Number.isFinite(preferred) ? preferred : 0;

  return {
    balanceLamports,
    balanceUi: data.balanceUi ?? "0",
    low: Boolean(data.low),
  };
}
