/**
 * Core types for Codama-backed policy verification.
 *
 * Instruction input uses Kit’s `Instruction` from `@solana/instructions`
 * (import it from there or `@solana/kit` — this package does not re-export it).
 */

export type VerifyOk = { ok: true };

/**
 * Structured fail context for UX / co-signer mapping.
 */
export type VerifyFailDetails = {
  instructionIndex?: number;
  programId?: string;
  instructionName?: string | null;
  field?: string;
  op?: string;
  limit?: string;
  actual?: string;
  mint?: string;
  amount?: string;
  decimals?: number;
  amountUi?: string;
  destination?: string;
  [key: string]: unknown;
};

export type VerifyFail = {
  ok: false;
  code: string;
  message: string;
  details?: VerifyFailDetails;
};

export type VerifyResult = VerifyOk | VerifyFail;

export function fail(
  code: string,
  message: string,
  details?: VerifyFailDetails
): VerifyFail {
  return details
    ? { ok: false, code, message, details }
    : { ok: false, code, message };
}

export function ok(): VerifyOk {
  return { ok: true };
}
