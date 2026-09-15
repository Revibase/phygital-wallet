/**
 * Classify phygital-wallet instructions for confirmation UX.
 * High-risk ops can move funds or strip authority — not a private-key leak,
 * but economically equivalent if the user rubber-stamps them.
 */

import { PhygitalWalletInstruction } from "phygital-wallet-sdk";
import type { ParsedInstructionSummary } from "./parser.js";
import type { TransactionSummary } from "./policy.js";

export type SignRisk = "normal" | "high";

export function instructionLabel(kind: PhygitalWalletInstruction): string {
  switch (kind) {
    case PhygitalWalletInstruction.ExecuteWithAuthority:
      return "Owner spend (bypasses accessory policy)";
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
      return "Owner spend (with wallet policies)";
    case PhygitalWalletInstruction.ClearAuthority:
      return "Remove owner authority";
    case PhygitalWalletInstruction.SetWalletPolicy:
      return "Change wallet policy";
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return "Clear wallet policy";
    case PhygitalWalletInstruction.Execute:
      return "Accessory execute";
    case PhygitalWalletInstruction.SetAuthority:
      return "Set authority";
    default:
      return "Unknown instruction";
  }
}

export function isHighRiskInstruction(kind: PhygitalWalletInstruction): boolean {
  switch (kind) {
    case PhygitalWalletInstruction.ExecuteWithAuthority:
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
    case PhygitalWalletInstruction.ClearAuthority:
    case PhygitalWalletInstruction.SetWalletPolicy:
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return true;
    default:
      return false;
  }
}

export function classifySignRisk(summary: TransactionSummary): SignRisk {
  return summary.instructions.some((ix) => isHighRiskInstruction(ix.kind))
    ? "high"
    : "normal";
}

export function highRiskWarning(ixs: ParsedInstructionSummary[]): string {
  const kinds = new Set(ixs.map((i) => i.kind));
  if (kinds.has(PhygitalWalletInstruction.ClearAuthority)) {
    return "This removes the owner key from this accessory. You may lose the ability to recover or spend with this wallet.";
  }
  if (
    kinds.has(PhygitalWalletInstruction.ExecuteWithAuthority) ||
    kinds.has(PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies)
  ) {
    return "This uses your owner key to spend or call programs. It does not reveal your private key, but a malicious app can drain funds if you approve the wrong transaction.";
  }
  return "This changes wallet policy. Only continue if you initiated this action yourself.";
}
