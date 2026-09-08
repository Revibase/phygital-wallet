import type { Instruction } from "@solana/kit";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";
import {
  buildPaymentsPolicy,
  DEFAULT_MINT,
  uiAmountToRaw,
  type PaymentsPolicyConfig,
} from "phygital-policy";
import { PHYGITAL_WALLET_PROGRAM_ADDRESS } from "phygital-wallet-sdk";

/** Well-known Compute Budget — strip before verify. */
export const COMPUTE_BUDGET_PROGRAM =
  "ComputeBudget111111111111111111111111111111";

const HARD_DENIED = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

function standingPolicy(): PaymentsPolicyConfig {
  const maxSol = process.env.MAX_SOL_LAMPORTS?.trim();
  const maxUsdc = process.env.MAX_USDC_RAW?.trim();
  return {
    version: "3",
    maxSolLamports: maxSol ?? "100000000",
    mintLimits: [
      {
        mint: DEFAULT_MINT,
        maxRaw: maxUsdc ?? uiAmountToRaw(50, 6).toString(),
      },
    ],
  };
}

export type PolicyVerdict =
  | { ok: true }
  | {
      ok: false;
      code: string;
      error: string;
      details?: Record<string, unknown>;
    };

/**
 * Fail-closed policy check built from Codama IDLs via phygital-policy.
 */
export function evaluatePolicy(
  instructions: readonly Instruction[],
): PolicyVerdict {
  const body = instructions.filter(
    (ix) => String(ix.programAddress) !== COMPUTE_BUDGET_PROGRAM,
  );

  if (body.length === 0) {
    return {
      ok: false,
      code: "unexpected_instruction",
      error: "Transaction has no instructions other than Compute Budget.",
    };
  }

  for (const ix of body) {
    if (HARD_DENIED.has(String(ix.programAddress))) {
      return {
        ok: false,
        code: "program_not_allowed",
        error:
          "Inner instructions must not target Phygital Wallet or Token programs.",
        details: { programId: String(ix.programAddress) },
      };
    }
  }

  const result = buildPaymentsPolicy(standingPolicy()).verify(body);
  if (result.ok) return { ok: true };

  return {
    ok: false,
    code: result.code,
    error: result.message,
    details: result.details as Record<string, unknown> | undefined,
  };
}
