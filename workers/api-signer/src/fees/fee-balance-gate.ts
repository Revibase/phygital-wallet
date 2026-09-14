import { MIN_ATTEMPT_FEE_LAMPORTS } from "@/fees/constants";

/**
 * Fee gate for prepaid fee balance on this signing service.
 * Uses a prepaid minimum-to-attempt, not a quote of post-wrap spend. It does
 * not debit; the webhook applies the debit after confirmed success. Top-up
 * detection lives in `decode-tx` (`isFeePayingInstruction`); this only checks
 * the balance floor.
 */
export function assertFeeBalance(args: { balanceLamports: number }) {
  const requiredLamports = MIN_ATTEMPT_FEE_LAMPORTS;
  const balanceLamports = args.balanceLamports;

  if (balanceLamports < requiredLamports) {
    return {
      ok: false as const,
      code: "insufficient_fee_balance",
      error: "Fee balance is too low for this transaction",
      soft: false as const,
      details: { balanceLamports, requiredLamports },
    };
  }

  return { ok: true as const };
}
