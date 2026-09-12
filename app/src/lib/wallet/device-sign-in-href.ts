/** Deep links for Home device sign-in / link → return to where the user started. */

import { getQueryErrorStatus, QueryHttpError } from "@/lib/queries/http";
import { PolicyDeniedError } from "phygital-wallet-sdk";
import {
  isPolicySetupScreen,
  parseTokenWalletPath,
  type PolicySetupScreen,
  walletHref,
} from "@/lib/wallet/token-routes";

export type { PolicySetupScreen };
export { isPolicySetupScreen };

/** Allowlisted `/token/…` return path after Home passkey + link. */
export function parseSafeTokenReturnPath(
  raw: string | null | undefined
): { token: string; returnTo: string } | null {
  const parsed = parseTokenWalletPath(raw);
  if (!parsed) return null;
  return { token: parsed.token, returnTo: parsed.path };
}

function resolveReturnPath(token: string, returnTo: string): string {
  const safe = parseSafeTokenReturnPath(returnTo);
  if (safe && safe.token === token) return safe.returnTo;
  return walletHref(token);
}

/** Home setup intent from `/?setup=limits&return=…` (limits = device sign-in). */
export function parseDeviceSignInIntent(args: {
  setup: string | null;
  returnPath: string | null;
}): { token: string; returnTo: string } | null {
  if (args.setup !== "limits") return null;
  const parsed = parseSafeTokenReturnPath(args.returnPath);
  if (!parsed) return null;
  return { token: parsed.token, returnTo: parsed.returnTo };
}

/** Home URL that runs Sign in / link, then returns to `returnTo`. */
export function deviceSignInHomeHref(args: {
  token: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams({
    // Query value is historical — means device sign-in/link, not spending limits.
    setup: "limits",
    return: resolveReturnPath(args.token, args.returnTo),
  });
  return `/?${params.toString()}`;
}

/** True when owner APIs need Home re-auth / re-link. */
export function isOwnerAuthFailure(e: unknown): boolean {
  const status = getQueryErrorStatus(e);
  const code =
    e instanceof QueryHttpError
      ? e.code
      : e instanceof PolicyDeniedError
      ? e.code
      : null;
  return (
    status === 401 ||
    status === 403 ||
    code === "not_owner" ||
    code === "device_session_required"
  );
}

/**
 * Go to Home for platform passkey + accessory link, then return to `returnTo`.
 */
export function redirectToDeviceSignIn(token: string, returnTo: string): void {
  window.location.replace(deviceSignInHomeHref({ token, returnTo }));
}

/**
 * Redirect to Home setup when owner APIs return 401/403.
 * Returns to `returnTo`, or the current path.
 */
export function handleOwnerAuthFailure(
  token: string,
  e: unknown,
  returnTo?: string
): boolean {
  if (!isOwnerAuthFailure(e)) return false;
  const path =
    returnTo ??
    (typeof window !== "undefined"
      ? window.location.pathname
      : walletHref(token));
  redirectToDeviceSignIn(token, path);
  return true;
}
