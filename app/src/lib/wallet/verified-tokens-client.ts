import type { PaymentToken } from "@/lib/tokens/payment-token";
import { queryFetch, readJson } from "@/lib/queries/http";

export async function fetchVerifiedTokens(): Promise<PaymentToken[]> {
  const res = await queryFetch("/tokens/verified");
  const data = await readJson<{ tokens?: PaymentToken[] }>(
    res,
    "Couldn’t load tokens"
  );
  return data.tokens ?? [];
}
