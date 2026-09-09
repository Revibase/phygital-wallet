/**
 * Normalize a token-verifier endpoint or default origin to an API base URL
 * (no trailing slash, no `/sign` or `/preview` suffix).
 */
export function normalizeVerifierApiBase(endpoint: string): string {
  let base = endpoint.trim().replace(/\/+$/, "");
  if (base.endsWith("/preview")) {
    base = base.slice(0, -"/preview".length);
  } else if (base.endsWith("/sign")) {
    base = base.slice(0, -"/sign".length);
  }
  return base.replace(/\/+$/, "");
}

export function verifierSignUrl(apiBase: string): string {
  return `${normalizeVerifierApiBase(apiBase)}/sign`;
}

export function verifierPreviewUrl(apiBase: string): string {
  return `${normalizeVerifierApiBase(apiBase)}/preview`;
}
