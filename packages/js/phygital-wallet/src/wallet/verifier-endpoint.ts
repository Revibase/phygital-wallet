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
  } else if (base.endsWith("/connect")) {
    base = base.slice(0, -"/connect".length);
  } else if (base.endsWith("/connect/tap")) {
    base = base.slice(0, -"/connect/tap".length);
  } else if (base.endsWith("/health")) {
    base = base.slice(0, -"/health".length);
  }
  return base.replace(/\/+$/, "");
}

export function verifierSignUrl(apiBase: string): string {
  return `${normalizeVerifierApiBase(apiBase)}/sign`;
}

export function verifierPreviewUrl(apiBase: string): string {
  return `${normalizeVerifierApiBase(apiBase)}/preview`;
}

/** WebAuthn connect — the portable contract every verifier implements. */
export function verifierConnectUrl(apiBase: string): string {
  return `${normalizeVerifierApiBase(apiBase)}/connect`;
}
