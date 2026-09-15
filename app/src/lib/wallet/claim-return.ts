import { parseTokenWalletPath } from "@/lib/wallet/token-routes";

/**
 * A pending "return here after owner sign-in" target. When a signed-out user
 * triggers an owner action (claim / unlink) on a token page, we stash where to
 * send them back to, redirect to home to sign in, then resume once the owner
 * wallet is authenticated.
 */
const PENDING_RETURN_KEY = "revibase:pending-return";

/** Stash a `/token/…` path to return to after sign-in. */
export function setPendingReturn(path: string): void {
  if (!parseTokenWalletPath(path)) return;
  try {
    sessionStorage.setItem(PENDING_RETURN_KEY, path);
  } catch {
    /* private mode / unavailable — no-op */
  }
}

/** Read and clear the pending return path, if any (validated). */
export function consumePendingReturn(): string | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_RETURN_KEY);
    if (raw) sessionStorage.removeItem(PENDING_RETURN_KEY);
  } catch {
    return null;
  }
  const parsed = parseTokenWalletPath(raw);
  return parsed ? parsed.path : null;
}
