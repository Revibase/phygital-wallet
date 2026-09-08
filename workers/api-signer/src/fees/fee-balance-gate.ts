import { getEnv, getTokenStore } from "@/shared/request-context";
import {
  MEMO_PROGRAM_ADDRESS,
  MIN_ATTEMPT_FEE_LAMPORTS,
} from "@/fees/constants";
import { SYSTEM_PROGRAM } from "@/verifier/constants";
import type { Instruction } from "@solana/kit";

/**
 * Top-up intents (SOL → accumulator + optional memo) must not require fee
 * balance or empty wallets could never fund network fees.
 */
function isFeeBalanceTopUpIntent(
  instructions: readonly Instruction[],
  accumulator: string,
): boolean {
  if (!accumulator || instructions.length === 0) return false;
  let sawTransfer = false;
  for (const ix of instructions) {
    const program = ix.programAddress;
    if (program === MEMO_PROGRAM_ADDRESS) continue;
    if (program !== SYSTEM_PROGRAM) return false;
    // System Transfer: discriminator 2, destination is accounts[1]
    const disc = ix.data?.[0];
    if (disc !== 2) return false;
    const dest = ix.accounts?.[1]?.address;
    if (!dest || dest !== accumulator) return false;
    sawTransfer = true;
  }
  return sawTransfer;
}

/**
 * Fee gate for prepaid fee balance on this signing service.
 * Evaluated on both `/preview` and `/sign`. Prepaid minimum-to-attempt (not a
 * quote of post-wrap spend). Does not debit — webhook debits after confirmed
 * success.
 *
 * Always enforced here: this Worker only co-signs with default verifier keys,
 * so a successful `/sign` sponsors fees. Custom TokenVerifier overrides use a
 * different endpoint; a POST here cannot land on-chain for them.
 */
export async function assertFeeBalance(args: {
  instructions: readonly Instruction[];
}) {
  const accumulator = getEnv().TOP_UP_ACCUMULATOR?.trim() ?? "";
  if (isFeeBalanceTopUpIntent(args.instructions, accumulator)) {
    return { ok: true as const };
  }

  const requiredLamports = MIN_ATTEMPT_FEE_LAMPORTS;
  const balanceLamports = getTokenStore().getFeeBalanceLamports();

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
