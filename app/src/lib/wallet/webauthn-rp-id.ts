/**
 * Shared WebAuthn RP ID for app + secure-signer.
 *
 * Production: `revibase.com` so create can run on app.* (top-level / Safari-safe)
 * while get+PRF stays in the signer iframe. Local: `localhost` (ports share the id).
 */
export function resolveWebAuthnRpId(hostname: string, envRpId?: string): string {
  const fromEnv = envRpId?.trim();
  if (fromEnv) return fromEnv;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
  if (hostname === "revibase.com" || hostname.endsWith(".revibase.com")) {
    return "revibase.com";
  }
  return hostname;
}
