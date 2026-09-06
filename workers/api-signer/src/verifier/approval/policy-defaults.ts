import {
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  defineStandardPolicy,
  type PolicyDocument,
  type StandardPolicyOptions,
} from "phygital-verifier-sdk";

import { getUsdcMint } from "@/tokens/usdc-mint";

/**
 * Template for first enable — not applied when no D1 row.
 * Missing standing policy ⇒ authorize skips SDK verify (hard-denies only).
 */
export function buildDefaultPolicy(
  opts: Omit<StandardPolicyOptions, "mint"> = {},
): PolicyDocument {
  return defineStandardPolicy({
    mint: String(getUsdcMint()),
    maxMintRaw: DEFAULT_MAX_MINT_RAW,
    maxSolLamports: DEFAULT_MAX_SOL_LAMPORTS,
    ...opts,
  });
}
