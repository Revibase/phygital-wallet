import { NextResponse, type NextRequest } from "next/server";

import {
  BROWSE_UNLOCK_COOKIE,
  canAccessPhygitalToken,
} from "@/lib/auth/session-cookies";
import { tokenHref, tokenUnlockHref } from "@/lib/wallet/token-routes";

/**
 * Gate every `/token/:address/**` surface on the httpOnly browse-unlock cookie
 * (card, wallet, settings hub + leaves, collectibles, send/receive, …).
 * Verifies HMAC locally with `POLICY_SESSION_SECRET` — same secret as the API.
 *
 * Escape hatch: `/token/:address/unlock` (Hold) issues the cookie, then navigates
 * back into the gated tree. Home → accessory uses the same gate via `tokenHref`.
 */
export async function middleware(request: NextRequest) {
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
    "/token/:address",
    "/token/:address/unlock",
    "/token/:address/wallet",
    "/token/:address/wallet/:path*",
  ],
};
