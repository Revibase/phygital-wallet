import { getApiBaseUrl } from "@/lib/api-base";
import { queryFetch } from "@/lib/queries/http";

const DEFAULT_FEE_PAYER_API_ORIGIN = "https://api.revibase.com";

/**
 * App fetch for fee-payer API calls (`/getFeePayer`, `/sign`) made by
 * `createDefaultFeePayer` / `getPhygitalWalletSigner`.
 *
 * Rewrites the SDK default Revibase origin onto this app's configured API base
 * (local/staging); cookies still ride along for app routes.
 */
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
