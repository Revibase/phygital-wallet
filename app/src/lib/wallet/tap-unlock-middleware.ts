/**
 * `/token` cold-start handling for Next middleware.
 *
 * - `?pk&s&c&n` → POST unlock/tap, forward Set-Cookie, redirect to wallet
 * - `?address=` → redirect to wallet for that token (admit cookie enforced on that path)
 *
 * Keeps NFC deep links off the client so hydrate never forks on search params.
 */
import { NextResponse, type NextRequest } from "next/server";

import { apiUrl } from "@/lib/api-base";
import { tryParseAddress } from "@/lib/solana/address";
import { TAP_ERROR_COOKIE } from "@/lib/wallet/tap-error-cookie";
import { walletHref } from "@/lib/wallet/token-routes";

type TapParams = { pk: string; s: string; c: string; n: string };

function readTapParams(url: URL): TapParams | null {
  const pk = url.searchParams.get("pk")?.trim() ?? "";
  const s = url.searchParams.get("s")?.trim() ?? "";
  const c = url.searchParams.get("c")?.trim() ?? "";
  const n = url.searchParams.get("n")?.trim() ?? "";
  if (!pk || !s || !c || !n) return null;
  return { pk, s, c, n };
}

function tapErrorRedirect(request: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/token", request.url));
  res.cookies.set(TAP_ERROR_COOKIE, "1", {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
  });
  return res;
}

/** Forward every Set-Cookie from the API (browse unlock + owner-browse clear). */
function forwardSetCookies(from: Response, to: NextResponse): void {
  const cookies = from.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    to.headers.append("Set-Cookie", cookie);
  }
}

/**
 * Handle exact `/token` cold starts. Returns null when the request should
 * continue to the page (Hold UI).
 */
export async function handleTokenColdStart(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (request.nextUrl.pathname !== "/token") return null;

  // Tap proof wins over legacy `?address=` when both are present.
  const tap = readTapParams(request.nextUrl);
  if (tap) {
    try {
      const apiRes = await fetch(apiUrl("/accessory/unlock/tap"), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(tap),
        cache: "no-store",
      });

      const body = (await apiRes.json().catch(() => ({}))) as {
        isVerified?: boolean;
        phygitalToken?: string;
      };

      const pda = body.phygitalToken
        ? tryParseAddress(body.phygitalToken)
        : null;

      if (!apiRes.ok || !body.isVerified || !pda) {
        return tapErrorRedirect(request);
      }

      const redirect = NextResponse.redirect(
        new URL(walletHref(String(pda)), request.url),
      );
      forwardSetCookies(apiRes, redirect);
      return redirect;
    } catch {
      return tapErrorRedirect(request);
    }
  }

  const addressRaw = request.nextUrl.searchParams.get("address")?.trim();
  if (addressRaw) {
    const parsed = tryParseAddress(addressRaw);
    if (!parsed) return null;
    // Cookie gate runs on `/token/{address}/**` — do not mint unlock from address alone.
    return NextResponse.redirect(
      new URL(walletHref(String(parsed)), request.url),
    );
  }

  return null;
}
