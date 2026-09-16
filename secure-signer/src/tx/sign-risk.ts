/**
 * Classify phygital-wallet instructions for confirmation UX.
 * Critical = irreversible; elevated = policy change; normal = spend/review.
 */

import { PhygitalWalletInstruction } from "phygital-wallet-sdk";
import type { ParsedInstructionSummary } from "./parser.js";
import type { TransactionSummary } from "./policy.js";

export type SignRisk = "normal" | "elevated" | "critical";

export function instructionLabel(kind: PhygitalWalletInstruction): string {
  switch (kind) {
    case PhygitalWalletInstruction.ExecuteWithAuthority:
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
      return "Owner spend";
    case PhygitalWalletInstruction.ClearAuthority:
      return "Remove owner";
    case PhygitalWalletInstruction.SetWalletPolicy:
      return "Update policy";
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return "Clear policy";
    case PhygitalWalletInstruction.Execute:
      return "Accessory spend";
    case PhygitalWalletInstruction.SetAuthority:
      return "Set owner";
    default:
      return "Transaction";
  }
}

export function instructionSubtitle(
  kind: PhygitalWalletInstruction,
): string | null {
  switch (kind) {
    case PhygitalWalletInstruction.ExecuteWithAuthority:
      return "Approved on this phone";
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
      return "Uses your wallet limits";
    case PhygitalWalletInstruction.ClearAuthority:
      return "This can’t be undone from here";
    case PhygitalWalletInstruction.SetWalletPolicy:
      return "Changes spend limits and rules";
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return "Removes custom limits";
    default:
      return null;
  }
}

export function isCriticalInstruction(kind: PhygitalWalletInstruction): boolean {
  return kind === PhygitalWalletInstruction.ClearAuthority;
}

export function isElevatedInstruction(kind: PhygitalWalletInstruction): boolean {
  return (
    kind === PhygitalWalletInstruction.SetWalletPolicy ||
    kind === PhygitalWalletInstruction.ClearWalletPolicy
  );
}

export function classifySignRisk(summary: TransactionSummary): SignRisk {
  if (summary.instructions.some((ix) => isCriticalInstruction(ix.kind))) {
    return "critical";
  }
  if (summary.instructions.some((ix) => isElevatedInstruction(ix.kind))) {
    return "elevated";
  }
  return "normal";
}

export function riskCallout(ixs: ParsedInstructionSummary[]): string | null {
  const kinds = new Set(ixs.map((i) => i.kind));
  if (kinds.has(PhygitalWalletInstruction.ClearAuthority)) {
    return "Removes the owner key from this accessory.";
  }
  if (kinds.has(PhygitalWalletInstruction.ClearWalletPolicy)) {
    return "Clears custom spend limits on this wallet.";
  }
  if (kinds.has(PhygitalWalletInstruction.SetWalletPolicy)) {
    return "Updates how this wallet can spend.";
  }
  return null;
}
