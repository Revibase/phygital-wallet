import { getApiBaseUrl } from "@/lib/api-base";
import { queryFetch } from "@/lib/queries/http";

const DEFAULT_VERIFIER_API_ORIGIN = "https://api.revibase.com";

/**
 * App fetch for the verifier `/preview` + `/sign` + `/getFeePayer` calls made by
 * `getPhygitalWalletSigner`.
 *
 * The rewrite maps the SDK's default Revibase origin onto this app's configured
 * API base (so local/staging work); it is **not** how these calls authenticate.
 * Cookies still ride along for Revibase app routes.
 */
export function appVerifierFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : String(input);
  const rewritten = raw.startsWith(DEFAULT_VERIFIER_API_ORIGIN)
    ? `${getApiBaseUrl()}${raw.slice(DEFAULT_VERIFIER_API_ORIGIN.length)}`
    : raw;
  return queryFetch(rewritten, init);
}
