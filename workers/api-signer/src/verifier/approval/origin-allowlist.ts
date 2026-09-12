/**
 * Origin allowlist gate — a session-level check applied to all signing kinds.
 *
 * The bearer origin is authoritative: `require-bearer` already forced it to
 * equal the live request Origin, and it is signed into the session bearer, so
 * it cannot be spoofed per request. Pure so it is trivially testable and adds
 * no I/O to the sign path.
 */
import type { PaymentsPolicyConfig } from "phygital-policy";

export type OriginVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "origin_not_allowed";
      error: string;
      origin: string | null;
    };

/**
 * Allow when the policy sets no `allowedOrigins`. Otherwise the bearer origin
 * must be a non-null, canonical origin present in the list — a server caller
 * (null origin) is denied whenever an allowlist exists.
 */
export function checkOriginAllowed(
  policy: PaymentsPolicyConfig | null,
  bearerOrigin: string | null,
): OriginVerdict {
  const allowed = policy?.allowedOrigins;
  if (!allowed || allowed.length === 0) return { ok: true };
  if (bearerOrigin !== null && allowed.includes(bearerOrigin)) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "origin_not_allowed",
    error: "This site is not allowed to sign for this item.",
    origin: bearerOrigin,
  };
}
