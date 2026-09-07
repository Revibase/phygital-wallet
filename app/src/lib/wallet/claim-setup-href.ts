/** Deep links for Home claim ceremony → return to where claim was started. */

import { parseSafeTokenReturnPath } from "@/lib/wallet/device-sign-in-href";
import { walletHref } from "@/lib/wallet/token-routes";

/** Allowlisted `/token/…` return path after claim. */
export function parseClaimReturnPath(
  raw: string | null | undefined,
): { token: string; path: string } | null {
  const parsed = parseSafeTokenReturnPath(raw);
  if (!parsed) return null;
  return { token: parsed.token, path: parsed.returnTo };
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

function resolveClaimReturn(token: string, returnTo?: string): string {
  const desired = returnTo ?? walletHref(token);
  const safe = parseClaimReturnPath(desired);
  if (safe && safe.token === token) return safe.path;
  return walletHref(token);
}

export function claimSetupHomeHref(token: string, returnTo?: string): string {
  const params = new URLSearchParams({
    setup: "claim",
    return: resolveClaimReturn(token, returnTo),
  });
  return `/?${params.toString()}`;
}

export function redirectToClaimSetup(token: string, returnTo?: string): void {
  window.location.replace(claimSetupHomeHref(token, returnTo));
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
