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
  allowHeaders: ["Content-Type", "Accept"],
  credentials: true,
  maxAge: 86400,
});

/**
 * Open CORS for third-party verifier / soft-deny ticket clients — no cookies.
 */
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
