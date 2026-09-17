/**
 * Transaction policy (depth 2, §16-§19). Everything security-sensitive is derived
 * from the SIGNER's own kit decode — never from parent-supplied descriptions (§17).
 *
 * Guarantees enforced here:
 *  - every top-level program is on the allowlist (phygital-wallet);
 *    ComputeBudget is not allowlisted, so it is rejected (redundant under v1, §18);
 *  - the authenticated wallet is a REQUIRED SIGNER of the transaction (§34/§15 —
 *    we only ever produce a signature for a slot the owner legitimately occupies);
 *  - each phygital-wallet instruction's `authority` account equals the authenticated wallet
 *    (the owner never co-signs another authority's operation);
 *  - setAuthority is rejected: the owner is never a signer of it on-chain.
 * The inner spend of executeWithAuthority is DISPLAYED, not blocked (escape hatch).
 */

import { getAddressDecoder, type V1TransactionConfig } from "@solana/kit";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PhygitalWalletInstruction,
} from "phygital-wallet-sdk";
import type { ErrorCode } from "../protocol.js";
import type { DecodedV1Transaction } from "./decode-v1.js";
import { parseInstruction, type ParsedInstructionSummary } from "./parser.js";

const addr = getAddressDecoder();

export interface TransactionSummary {
  walletAddress: string;
  instructions: ParsedInstructionSummary[];
  config: V1TransactionConfig;
}

export type PolicyResult =
  | { ok: true; summary: TransactionSummary }
  | { ok: false; code: ErrorCode };

export function evaluatePolicy(
  tx: DecodedV1Transaction,
  ownerPubkey: Uint8Array
): PolicyResult {
  const preview = previewPolicy(tx);
  if (!preview.ok) return preview;

  const ownerAddress = addr.decode(ownerPubkey);
  if (!(ownerAddress in tx.transaction.signatures)) {
    return { ok: false, code: "WALLET_MISMATCH" };
  }

  for (const summary of preview.summary.instructions) {
    if (summary.authority !== null && summary.authority !== ownerAddress) {
      return { ok: false, code: "POLICY_REJECTED" };
    }
  }

  return {
    ok: true,
    summary: {
      ...preview.summary,
      walletAddress: ownerAddress,
    },
  };
}

/**
 * Allowlist + decode for confirm UI before the owner pubkey is known
 * (cold-start restore+sign). Owner binding runs in {@link evaluatePolicy} after restore.
 */
export function previewPolicy(tx: DecodedV1Transaction): PolicyResult {
  const { message } = tx;
  if (message.instructions.length === 0)
    return { ok: false, code: "POLICY_REJECTED" };

  for (const ix of message.instructions) {
    if (ix.programAddress !== PHYGITAL_WALLET_PROGRAM_ADDRESS) {
      return { ok: false, code: "POLICY_REJECTED" };
    }
  }

  const summaries: ParsedInstructionSummary[] = [];
  for (const ix of message.instructions) {
    let summary: ParsedInstructionSummary;
    try {
      summary = parseInstruction(ix);
    } catch {
      return { ok: false, code: "POLICY_REJECTED" };
    }
    if (summary.kind === PhygitalWalletInstruction.SetAuthority)
      return { ok: false, code: "POLICY_REJECTED" };
    summaries.push(summary);
  }

  const walletAddress =
    summaries.find((s) => s.authority !== null)?.authority ?? "";

  return {
    ok: true,
    summary: {
      walletAddress,
      instructions: summaries,
      config: tx.message.config ?? {},
    },
  };
}
