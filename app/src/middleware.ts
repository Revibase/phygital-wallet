import { NextResponse, type NextRequest } from "next/server";

import {
  BROWSE_UNLOCK_COOKIE,
  DEVICE_SESSION_COOKIE,
  canAccessTokenWallet,
  verifyDeviceSessionCookie,
} from "@/lib/auth/session-cookies";
import {
  isOwnerOnlySettings,
  settingsFromSegment,
  tokenHref,
  walletSettingsHref,
} from "@/lib/wallet/token-routes";

/**
 * Gate `/token/:address/wallet/**` on httpOnly session cookies set by the API.
 * Verifies HMAC locally (same secret as api) — no API round-trip.
 *
 * - Wallet browse: browse-unlock for this address, or a valid device session
 * - Owner-only settings leaves: valid device session required
 *   (send-protections, spending-limits, recipients, exceptions, signing, recovery)
 */
export async function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(
    /^\/token\/([^/]+)\/wallet(?:\/(.*))?$/,
  );
  if (!match?.[1]) return NextResponse.next();

  const phygitalToken = decodeURIComponent(match[1]);
  const rest = match[2] ?? "";
  const secret = process.env.POLICY_SESSION_SECRET?.trim() ?? "";
  if (!secret) {
    return NextResponse.redirect(new URL(tokenHref(phygitalToken), request.url));
  }

  const settingsLeaf = rest.match(/^settings\/([^/]+)\/?$/);
  const settingsTarget = settingsLeaf
    ? settingsFromSegment(decodeURIComponent(settingsLeaf[1]))
    : null;

  if (settingsTarget && isOwnerOnlySettings(settingsTarget)) {
    const session = await verifyDeviceSessionCookie(
      request.cookies.get(DEVICE_SESSION_COOKIE)?.value,
      secret,
    );
    if (!session) {
      return NextResponse.redirect(
        new URL(walletSettingsHref(phygitalToken), request.url),
      );
    }
    return NextResponse.next();
  }

  const allowed = await canAccessTokenWallet({
    phygitalToken,
    deviceSessionCookie: request.cookies.get(DEVICE_SESSION_COOKIE)?.value,
    browseUnlockCookie: request.cookies.get(BROWSE_UNLOCK_COOKIE)?.value,
    secret,
  });

  if (allowed) return NextResponse.next();

  return NextResponse.redirect(new URL(tokenHref(phygitalToken), request.url));
}

export const config = {
  matcher: ["/token/:address/wallet", "/token/:address/wallet/:path*"],
};
