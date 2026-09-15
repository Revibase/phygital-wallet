/**
 * Transaction policy (depth 2, §16-§19). Everything security-sensitive is derived
 * from the SIGNER's own decoder — never from parent-supplied descriptions (§17).
 *
 * Guarantees enforced here:
 *  - every top-level program is on the allowlist (phygital-wallet + Memo);
 *    ComputeBudget is not allowlisted, so it is rejected (redundant under v1, §18);
 *  - the authenticated wallet is a REQUIRED SIGNER of the transaction (§34/§15 —
 *    we only ever produce a signature for a slot the owner legitimately occupies);
 *  - each Fjbi instruction's `authority` account equals the authenticated wallet
 *    (the owner never co-signs another authority's operation);
 *  - setAuthority is rejected: the owner is never a signer of it on-chain.
 * The inner spend of executeWithAuthority is DISPLAYED, not blocked (escape hatch).
 */

import { getAddressDecoder } from "@solana/kit";
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
  /** Index of the owner among required signers — where its signature goes. */
  ownerSignerIndex: number;
  instructions: ParsedInstructionSummary[];
  config: DecodedV1Transaction["config"];
}

export type PolicyResult =
  | { ok: true; summary: TransactionSummary }
  | { ok: false; code: ErrorCode };

export function evaluatePolicy(
  tx: DecodedV1Transaction,
  ownerPubkey: Uint8Array,
): PolicyResult {
  if (tx.instructions.length === 0)
    return { ok: false, code: "POLICY_REJECTED" };

  // 1. Top-level program allowlist.
  for (const ix of tx.instructions) {
    const program = addr.decode(tx.staticAccounts[ix.programIdIndex]!);
    if (program !== PHYGITAL_WALLET_PROGRAM_ADDRESS) {
      return { ok: false, code: "POLICY_REJECTED" };
    }
  }

  // 2. Owner must be a required signer; locate its slot.
  const ownerAddress = addr.decode(ownerPubkey);
  let ownerSignerIndex = -1;
  for (let i = 0; i < tx.header.numRequiredSignatures; i++) {
    if (addr.decode(tx.staticAccounts[i]!) === ownerAddress) {
      ownerSignerIndex = i;
      break;
    }
  }
  if (ownerSignerIndex < 0) return { ok: false, code: "WALLET_MISMATCH" };

  // 3. Decode each phygital-wallet instruction; bind authority to the owner.
  //    Other allowlisted programs (e.g. Memo) carry no owner authority and are
  //    permitted but not Fjbi-decoded — they are counted for display only.
  const summaries: ParsedInstructionSummary[] = [];
  for (const ix of tx.instructions) {
    let summary: ParsedInstructionSummary;
    try {
      summary = parseInstruction(tx, ix);
    } catch {
      return { ok: false, code: "POLICY_REJECTED" };
    }
    // The owner never signs setAuthority (authorized by passkey + payer on-chain).
    if (summary.kind === PhygitalWalletInstruction.SetAuthority)
      return { ok: false, code: "POLICY_REJECTED" };
    // Any instruction that carries an authority must be authorized by the owner.
    if (summary.authority !== null && summary.authority !== ownerAddress) {
      return { ok: false, code: "POLICY_REJECTED" };
    }
    summaries.push(summary);
  }

  // Require at least one phygital-wallet instruction — the signer is not a
  // general-purpose signer (§16); a memo-only transaction has nothing to authorize.
  if (summaries.length === 0) return { ok: false, code: "POLICY_REJECTED" };

  return {
    ok: true,
    summary: {
      walletAddress: ownerAddress,
      ownerSignerIndex,
      instructions: summaries,
      config: tx.config,
    },
  };
}
