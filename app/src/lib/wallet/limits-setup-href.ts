/** Deep links for Home setup → return into wallet Limits screens. */

import {
  getQueryErrorStatus,
  QueryHttpError,
} from "@/lib/queries/http";
import {
  isPolicySetupScreen,
  parseTokenWalletPath,
  settingsFromSegment,
  type PolicySetupScreen,
  walletSettingsHref,
} from "@/lib/wallet/token-routes";

export type { PolicySetupScreen };
export { isPolicySetupScreen };

export function tokenLimitsReturnPath(
  token: string,
  screen: PolicySetupScreen,
): string {
  return walletSettingsHref(token, screen);
}

/**
 * Parse a same-origin return path into a limits setup screen.
 * Accepts `/token/{address}/wallet/settings/{spending-limits|recipients|exceptions}`.
 */
export function parseSetupReturnPath(
  raw: string | null | undefined,
): { token: string; screen: PolicySetupScreen; path: string } | null {
  const parsed = parseTokenWalletPath(raw);
  if (!parsed || parsed.kind !== "wallet") return null;
  const [head, seg] = parsed.segments;
  if (head !== "settings" || !seg) return null;

  const target = settingsFromSegment(seg);
  if (!target || !isPolicySetupScreen(target)) return null;

  return {
    token: parsed.token,
    screen: target,
    path: tokenLimitsReturnPath(parsed.token, target),
  };
}

/** Home setup intent from `/?setup=limits&return=…`. */
export function parseLimitsSetupIntent(args: {
  setup: string | null;
  returnPath: string | null;
}): { token: string; screen: PolicySetupScreen; returnTo: string } | null {
  if (args.setup !== "limits") return null;
  const parsed = parseSetupReturnPath(args.returnPath);
  if (!parsed) return null;
  return {
    token: parsed.token,
    screen: parsed.screen,
    returnTo: parsed.path,
  };
}

/** Home URL that runs Sign in / link, then returns to the wallet sheet. */
export function limitsSetupHomeHref(args: {
  token: string;
  screen: PolicySetupScreen;
}): string {
  const params = new URLSearchParams({
    setup: "limits",
    return: tokenLimitsReturnPath(args.token, args.screen),
  });
  return `/?${params.toString()}`;
}

/** True when owner APIs need Home re-auth / re-link. */
export function isOwnerAuthFailure(e: unknown): boolean {
  const status = getQueryErrorStatus(e);
  const code = e instanceof QueryHttpError ? e.code : null;
  return (
    status === 401 ||
    status === 403 ||
    code === "not_owner" ||
    code === "device_session_required"
  );
}

export function redirectToLimitsSetup(
  token: string,
  screen: PolicySetupScreen = "spendingLimits",
): void {
  window.location.assign(limitsSetupHomeHref({ token, screen }));
}

/** Redirect to Home setup when owner APIs return 401/403. */
export function handleOwnerAuthFailure(
  token: string,
  e: unknown,
  screen: PolicySetupScreen = "spendingLimits",
): boolean {
  if (!isOwnerAuthFailure(e)) return false;
  redirectToLimitsSetup(token, screen);
  return true;
}
