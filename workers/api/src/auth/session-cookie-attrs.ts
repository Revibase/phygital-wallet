/**
 * Shared Set-Cookie attributes for device access/refresh + browse unlock.
 * Production uses Domain=.revibase.com so the Next.js app middleware can
 * read the same httpOnly cookies the API sets.
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
    if (host === "revibase.com" || host.endsWith(".revibase.com")) {
      return { secure: true, sameSite: "None", domain: ".revibase.com" };
    }
  } catch {
    /* fall through */
  }
  return { secure: true, sameSite: "None" };
}
