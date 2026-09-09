import type { Instruction } from "@solana/kit";
import {
  buildPaymentsPolicy,
  type PaymentsPolicyConfig,
} from "phygital-policy";
import type { VerifyFailDetails } from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { COMPUTE_BUDGET_PROGRAM } from "@/verifier/constants";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";

const HARD_DENIED_PROGRAMS = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

type PolicyVerdict =
  | { ok: true }
  | {
      ok: false;
      code: string;
      error: string;
      soft: boolean;
      details?: VerifyFailDetails;
    };

/**
 * Strip Compute Budget → hard-deny phygital programs → SDK verify
 * (skipped when `policy` is null). Soft fails come from rule `onFail`.
 */
export function evaluatePolicy(
  policy: PaymentsPolicyConfig | null,
  instructions: readonly Instruction[],
): PolicyVerdict {
  const body = instructions.filter(
    (ix) => String(ix.programAddress) !== COMPUTE_BUDGET_PROGRAM,
  );

  if (body.length === 0) {
    return {
      ok: false,
      code: "unexpected_instruction",
      soft: false,
      error: "Transaction has no instructions other than Compute Budget.",
    };
  }

  for (const ix of body) {
    if (HARD_DENIED_PROGRAMS.has(String(ix.programAddress))) {
      return {
        ok: false,
        code: "program_not_allowed",
        soft: false,
        error:
          "This instruction targets Phygital Wallet or Token and cannot be approved once.",
        details: { programId: String(ix.programAddress) },
      };
    }
  }

  if (policy == null) return { ok: true };

  const result = buildPaymentsPolicy(policy).verify(body);
  if (result.ok) return { ok: true };

  return {
    ok: false,
    soft: true,
    code: result.code,
    error: result.message,
    details: result.details,
  };
}
