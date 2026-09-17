import { cors } from "hono/cors";
import type { Context, Next } from "hono";

import { isOpenCorsPath, normalizeApiPath } from "@/auth/require-app-access";

/**
 * Hosts allowed for credentialed browser CORS + WebAuthn-gated routes.
 * Explicit allowlist (not `*.revibase.com`) so a compromised sibling subdomain
 * cannot call credentialed APIs. RP ID remains apex `revibase.com`.
 *
 * Includes `signer.revibase.com` so the secure-signer iframe can restore/PUT
 * without routing ciphertext through the parent.
 */
const APP_BROWSER_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "app.revibase.com",
  "signer.revibase.com",
]);

/** Browser origins allowed to call this Worker with credentials. */
export function isAppBrowserOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return APP_BROWSER_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** Open fee-payer paths: app origins stay credentialed; others are cookie-free. */
export function corsModeForRequest(
  method: string,
  path: string,
  origin: string | undefined,
): "open" | "credentialed" {
  if (!isOpenCorsPath(method, normalizeApiPath(path))) return "credentialed";
  if (origin && !isAppBrowserOrigin(origin)) return "open";
  return "credentialed";
}

const appCredentialedCors = cors({
  origin: (origin) => {
    if (!origin) return "*";
    return isAppBrowserOrigin(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Accept"],
  credentials: true,
  maxAge: 86400,
});

const openPublicCors = cors({
  origin: (origin) => origin || "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Accept"],
  credentials: false,
  maxAge: 86400,
});

export async function appCors(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const mode = corsModeForRequest(
    c.req.method,
    c.req.path,
    c.req.header("Origin") ?? undefined,
  );
  if (mode === "open") {
    return openPublicCors(c, next);
  }
  return appCredentialedCors(c, next);
}
