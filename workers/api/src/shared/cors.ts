import { cors } from "hono/cors";
import type { Context, Next } from "hono";

import { isOpenCorsPath, normalizeApiPath } from "@/auth/require-app-access";

/** Browser origins allowed to call this Worker with credentials. */
export function isAppBrowserOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".revibase.com") ||
      host === "revibase.com"
    );
  } catch {
    return false;
  }
}

/**
 * Guard routes that only the Revibase app should reach.
 *
 * A browser always sends `Origin` on cross-origin requests and cannot forge it,
 * so an origin outside the allowlist is rejected. A *missing* `Origin` means a
 * non-browser caller, which this gate deliberately allows: it is a scoping
 * measure, and every route using it independently authenticates its caller
 * (a self-validating tap proof, or a bearer).
 */
export function requireAppOrigin(c: {
  req: { header: (name: string) => string | undefined };
}): Response | null {
  const origin = c.req.header("Origin");
  if (!origin || isAppBrowserOrigin(origin)) return null;
  return new Response(
    JSON.stringify({
      error: "Not available for this origin",
      code: "origin_forbidden",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/** Strict origin guard for the Revibase app's dynamic NFC connect route. */
export function requireRevibaseAppOrigin(c: {
  req: { header: (name: string) => string | undefined };
}): Response | null {
  const origin = c.req.header("Origin");
  if (!origin) {
    return new Response(
      JSON.stringify({
        error: "Revibase app origin required",
        code: "origin_forbidden",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  try {
    const url = new URL(origin);
    const allowed =
      (url.protocol === "https:" && url.hostname === "app.revibase.com") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";
    if (allowed) return null;
  } catch {
    // Fall through to the same stable error response as other disallowed origins.
  }
  return new Response(
    JSON.stringify({
      error: "Not available for this origin",
      code: "origin_forbidden",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Open paths (`/preview`, ticket routes, …): app origins keep credentialed CORS
 * so soft-deny can see the device cookie; third-party origins stay cookie-free.
 */
export function corsModeForRequest(
  method: string,
  path: string,
  origin: string | undefined,
): "open" | "credentialed" {
  if (!isOpenCorsPath(method, normalizeApiPath(path))) return "credentialed";
  if (origin && !isAppBrowserOrigin(origin)) return "open";
  return "credentialed";
}

/** Credentialed CORS for the Revibase app (cookies). */
const appCredentialedCors = cors({
  origin: (origin) => {
    if (!origin) return "*";
    return isAppBrowserOrigin(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Accept", "Authorization"],
  credentials: true,
  maxAge: 86400,
});

/**
 * Open CORS for third-party verifier / soft-deny ticket clients — no cookies.
 */
const openPublicCors = cors({
  origin: (origin) => origin || "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Accept", "Authorization"],
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
