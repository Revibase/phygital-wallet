import { getEnv, getTokenStore } from "@/shared/request-context";
import {
  MEMO_PROGRAM_ADDRESS,
  requiredFeeLamports,
} from "@/fees/constants";
import { usesDefaultVerifierPaymaster } from "@/fees/default-verifier";
import { SYSTEM_PROGRAM } from "@/verifier/constants";
import type { Instruction } from "phygital-verifier-sdk";

/**
 * Top-up intents (SOL → accumulator + optional memo) must not require fee
 * balance or empty wallets could never fund the paymaster.
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
 * Fee gate for default-verifier paymaster sponsorship.
 * Evaluated inside the private signer Worker on both `/preview` and `/sign`.
 * On `/sign`, runs before authorize so a failed fee check cannot consume a grant.
 * On `/preview`, runs only after authorize succeeds (skip fee RPC on deny).
 * Does not debit — webhook debits after confirmed success.
 */
export async function assertFeeBalance(args: {
  phygitalToken: string;
  instructions: readonly Instruction[];
}) {
  const accumulator = getEnv().TOP_UP_ACCUMULATOR?.trim() ?? "";
  if (isFeeBalanceTopUpIntent(args.instructions, accumulator)) {
    return { ok: true as const };
  }

  const usesDefault = await usesDefaultVerifierPaymaster(args.phygitalToken);
  if (!usesDefault) {
    return { ok: true as const };
  }

  const requiredLamports = requiredFeeLamports(args.instructions.length);
  const balanceLamports = getTokenStore().getFeeBalanceLamports();

  if (balanceLamports < requiredLamports) {
    return {
      ok: false as const,
      code: "insufficient_fee_balance",
      error: "Fee balance is too low to sponsor this transaction",
      soft: false as const,
      details: { balanceLamports, requiredLamports },
    };
  }

  return { ok: true as const };
}
