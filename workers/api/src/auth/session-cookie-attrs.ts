/**
 * Shared Set-Cookie attributes for device access/refresh + browse unlock.
 *
 * Production uses `Domain=.revibase.com` so Next.js middleware on
 * `app.revibase.com` can verify httpOnly admit cookies set by
 * `api.revibase.com`. Credentialed API abuse from sibling subdomains is blocked
 * by the explicit CORS host allowlist (not by cookie Domain). Keep unused
 * `*.revibase.com` hosts offline — Domain shares cookies across the apex.
 */
import type { Context } from "hono";

export type SessionCookieAttrs = {
  secure: boolean;
  sameSite: "None" | "Lax";
  domain?: string;
};

export function sessionCookieAttrsForRequest(c: Context): SessionCookieAttrs {
  try {
    const url = new URL(c.req.url);
    const host = url.hostname;
    const localHttp =
      url.protocol === "http:" &&
      (host === "localhost" || host === "127.0.0.1");
    if (localHttp) {
      return { secure: false, sameSite: "Lax" };
    }
    // Host-only cookies when the API is served on the app origin (preview /
    // same-host deploys). Apex Domain is required only for api↔app split.
    if (host === "app.revibase.com" || host === "signer.revibase.com") {
      return { secure: true, sameSite: "None" };
    }
    if (host === "revibase.com" || host.endsWith(".revibase.com")) {
      return { secure: true, sameSite: "None", domain: ".revibase.com" };
    }
  } catch {
    /* fall through */
  }
  return { secure: true, sameSite: "None" };
}
