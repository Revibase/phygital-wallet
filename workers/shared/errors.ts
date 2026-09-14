/**
 * Shared error helpers for the `api` and `api-signer` workers.
 *
 * Errors carry a stable machine `code` (and optional http `status`, `details`,
 * `soft`) so a single mapper — `normalizeError` — can turn any thrown value into
 * one canonical response shape. There is exactly one code→status table here,
 * rather than a copy per handler.
 */

/** A stable, client-facing error code (e.g. `invalid_transaction`). */
export type ErrorCode = string;

/** Optional structured metadata carried on a coded error. */
export type ErrorDetails = Record<string, unknown>;

/** An Error enriched with a machine `code` and optional response metadata. */
export interface CodedError extends Error {
  code: ErrorCode;
  /** Explicit http status; wins over the code→status table when set. */
  status?: number;
  details?: ErrorDetails;
  /** Expected/recoverable condition the client can retry or handle inline. */
  soft?: boolean;
}

/** Build a coded Error. Prefer this over hand-rolled `Object.assign`. */
export function coded(
  message: string,
  code: ErrorCode,
  extra?: { status?: number; details?: ErrorDetails; soft?: boolean },
): CodedError {
  return Object.assign(new Error(message), { code, ...extra });
}

/** True when `err` is an Error carrying a machine `code`. */
export function isCodedError(err: unknown): err is CodedError {
  return (
    err instanceof Error && typeof (err as { code?: unknown }).code === "string"
  );
}

/** Extract a human-readable message from any thrown value. */
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The canonical error shape every worker maps thrown values into. */
export type NormalizedError = {
  error: string;
  code: ErrorCode;
  status: number;
  details?: ErrorDetails;
  soft?: boolean;
};

/** Single code→status table. `fallbackStatus` applies to unknown codes. */
function statusForCode(code: ErrorCode, fallbackStatus: number): number {
  switch (code) {
    case "signer_misconfigured":
    case "fee_misconfigured":
      return 500;
    case "verifier_mismatch":
    case "fee_payer_mismatch":
    case "insufficient_fee_balance":
      return 403;
    case "invalid_transaction":
    case "unexpected_instruction":
    case "token_mismatch":
      return 400;
    default:
      return fallbackStatus;
  }
}

/**
 * Map any thrown value into the canonical error shape.
 *
 * A coded error's own `status` wins; otherwise the code→status table decides.
 * `fallback` seeds the message/code/status used for uncoded throws — pass
 * `{ code, status: 500 }` on internal paths where a bare throw is a bug, not
 * bad input.
 */
export function normalizeError(
  err: unknown,
  fallback?: { message?: string; code?: ErrorCode; status?: number },
): NormalizedError {
  const codedErr = isCodedError(err) ? err : null;
  const code = codedErr?.code ?? fallback?.code ?? "invalid_transaction";
  return {
    error: getErrorMessage(err, fallback?.message ?? "Request failed"),
    code,
    status: codedErr?.status ?? statusForCode(code, fallback?.status ?? 400),
    details: codedErr?.details,
    soft: codedErr?.soft,
  };
}
