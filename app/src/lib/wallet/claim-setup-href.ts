/** Deep links for Home claim ceremony → return to token wallet. */

import { tokenHomeHref } from "@/lib/wallet/token-home-href";

/**
 * Parse a same-origin `/token?address=` return path for claim setup.
 */
export function parseClaimReturnPath(
  raw: string | null | undefined,
): { token: string; path: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/token")) return null;
  if (trimmed.startsWith("//") || /[\x00-\x1f\\]/.test(trimmed)) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  try {
    const u = new URL(trimmed, "https://revibase.invalid");
    if (u.username || u.password || u.host !== "revibase.invalid") return null;
    if (u.pathname !== "/token") return null;
    const address = u.searchParams.get("address")?.trim();
    if (!address) return null;
    return { token: address, path: tokenHomeHref(address) };
  } catch {
    return null;
  }
}

/** Home setup intent from `/?setup=claim&return=/token?address=…`. */
export function parseClaimSetupIntent(args: {
  setup: string | null;
  returnPath: string | null;
}): { token: string; returnTo: string } | null {
  if (args.setup !== "claim") return null;
  const parsed = parseClaimReturnPath(args.returnPath);
  if (!parsed) return null;
  return { token: parsed.token, returnTo: parsed.path };
}

export function claimSetupHomeHref(token: string): string {
  const params = new URLSearchParams({
    setup: "claim",
    return: tokenHomeHref(token),
  });
  return `/?${params.toString()}`;
}

export function redirectToClaimSetup(token: string): void {
  window.location.assign(claimSetupHomeHref(token));
}

const CLAIM_DISMISS_PREFIX = "revibase.claimDismissed.";

export function isClaimDismissed(phygitalToken: string): boolean {
  try {
    return sessionStorage.getItem(CLAIM_DISMISS_PREFIX + phygitalToken) === "1";
  } catch {
    return false;
  }
}

export function dismissClaim(phygitalToken: string): void {
  try {
    sessionStorage.setItem(CLAIM_DISMISS_PREFIX + phygitalToken, "1");
  } catch {
    /* private mode */
  }
}

export function clearClaimDismiss(phygitalToken: string): void {
  try {
    sessionStorage.removeItem(CLAIM_DISMISS_PREFIX + phygitalToken);
  } catch {
    /* ignore */
  }
}
