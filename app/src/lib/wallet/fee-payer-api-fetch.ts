import { getApiBaseUrl } from "@/lib/api-base";
import { queryFetch } from "@/lib/queries/http";

const DEFAULT_FEE_PAYER_API_ORIGIN = "https://api.revibase.com";

export function appFeePayerApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : String(input);
  const rewritten = raw.startsWith(DEFAULT_FEE_PAYER_API_ORIGIN)
    ? `${getApiBaseUrl()}${raw.slice(DEFAULT_FEE_PAYER_API_ORIGIN.length)}`
    : raw;
  return queryFetch(rewritten, init);
}
