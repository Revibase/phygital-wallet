/** Deep links for Home claim ceremony → return to token wallet. */

import { parseTokenWalletPath, walletHref } from "@/lib/wallet/token-routes";

/**
 * Parse a same-origin `/token/{address}` (or wallet home) return path for claim.
 * Always normalizes to wallet home — claim overlay lives under wallet layout.
 */
export function parseClaimReturnPath(
  raw: string | null | undefined,
): { token: string; path: string } | null {
  const parsed = parseTokenWalletPath(raw);
  if (!parsed) return null;
  // Card or wallet root only — not a deep settings path.
  if (parsed.kind === "wallet" && parsed.segments.length > 0) {
    return null;
  }
  return { token: parsed.token, path: walletHref(parsed.token) };
}

/** Home setup intent from `/?setup=claim&return=…`. */
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
    return: walletHref(token),
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
