import { NextResponse, type NextRequest } from "next/server";

import {
  BROWSE_UNLOCK_COOKIE,
  OWNER_BROWSE_COOKIE,
  OWNER_SESSION_COOKIE,
  canAccessPhygitalToken,
  verifyOwnerSessionCookie,
} from "@/lib/auth/session-cookies";
import { handleTokenColdStart } from "@/lib/wallet/tap-unlock-middleware";
import { tokenHref, tokenUnlockHref } from "@/lib/wallet/token-routes";

/**
 * - `/token?pk&s&c&n` → API unlock + cookie + redirect to `/token/{pda}`
 * - `/token?address=` → redirect to `/token/{address}`
 * - `/token/:address/**` → browse-unlock or owner-browse HMAC gate
 *
 * Verifies admit cookies locally with `POLICY_SESSION_SECRET` (same as API).
 */
export async function middleware(request: NextRequest) {
  const coldStart = await handleTokenColdStart(request);
  if (coldStart) return coldStart;

  const match = request.nextUrl.pathname.match(
    /^\/token\/([^/]+)(?:\/(.*))?$/,
  );
  if (!match?.[1]) return NextResponse.next();

  const phygitalToken = decodeURIComponent(match[1]);
  const rest = (match[2] ?? "").replace(/\/$/, "");
  const isUnlock = rest === "unlock";

  const secret = process.env.POLICY_SESSION_SECRET?.trim() ?? "";
  const unlocked =
    Boolean(secret) &&
    (await canAccessPhygitalToken({
      phygitalToken,
      browseUnlockCookie: request.cookies.get(BROWSE_UNLOCK_COOKIE)?.value,
      ownerBrowseCookie: request.cookies.get(OWNER_BROWSE_COOKIE)?.value,
      secret,
    }));

  if (isUnlock) {
    if (unlocked) {
      return NextResponse.redirect(
        new URL(tokenHref(phygitalToken), request.url),
      );
    }
    return NextResponse.next();
  }

  if (unlocked) return NextResponse.next();

  // Signed-in owner without this item's browse cookie → home (open from Home).
  if (secret) {
    const ownerSession = await verifyOwnerSessionCookie(
      request.cookies.get(OWNER_SESSION_COOKIE)?.value,
      secret,
    );
    if (ownerSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.redirect(
    new URL(tokenUnlockHref(phygitalToken), request.url),
  );
}

/**
 * Explicit paths so card, wallet, and settings hub/leaves are never missed.
 * (`:path*` alone can be easy to misread in reviews.)
 */
export const config = {
  matcher: [
    "/token",
    "/token/:address",
    "/token/:address/unlock",
    "/token/:address/wallet",
    "/token/:address/wallet/:path*",
  ],
};
