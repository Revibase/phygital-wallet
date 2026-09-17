/**
 * Classify phygital-wallet instructions for confirmation UX.
 * Critical = irreversible / open tap; elevated = policy change / owner spend.
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
      return "Turn off protections";
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
      return "Approved on this phone — bypasses accessory limits";
    case PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies:
      return "Uses your wallet limits";
    case PhygitalWalletInstruction.ClearAuthority:
      return "This can’t be undone from here";
    case PhygitalWalletInstruction.SetWalletPolicy:
      return "Changes spend limits and rules";
    case PhygitalWalletInstruction.ClearWalletPolicy:
      return "A tap can spend without checks until you restore protections";
    default:
      return null;
  }
}

export function isCriticalInstruction(kind: PhygitalWalletInstruction): boolean {
  return (
    kind === PhygitalWalletInstruction.ClearAuthority ||
    kind === PhygitalWalletInstruction.ClearWalletPolicy
  );
}

export function isElevatedInstruction(kind: PhygitalWalletInstruction): boolean {
  return kind === PhygitalWalletInstruction.SetWalletPolicy;
}

/** Owner escape-hatch spends are elevated by default; unknown inners → critical. */
function ownerSpendRisk(ixs: ParsedInstructionSummary[]): SignRisk | null {
  const ownerSpend = ixs.filter(
    (ix) =>
      ix.kind === PhygitalWalletInstruction.ExecuteWithAuthority ||
      ix.kind === PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies,
  );
  if (ownerSpend.length === 0) return null;

  for (const ix of ownerSpend) {
    const inner = ix.inner ?? [];
    if (inner.length === 0) return "critical";
    for (const row of inner) {
      if (
        row.title.startsWith("Program ") ||
        row.title.includes("opaque") ||
        row.details.some((d) => /unknown|opaque/i.test(d.value))
      ) {
        return "critical";
      }
    }
  }
  return "elevated";
}

export function classifySignRisk(summary: TransactionSummary): SignRisk {
  if (summary.instructions.some((ix) => isCriticalInstruction(ix.kind))) {
    return "critical";
  }
  const ownerRisk = ownerSpendRisk(summary.instructions);
  if (ownerRisk === "critical") return "critical";
  if (summary.instructions.some((ix) => isElevatedInstruction(ix.kind))) {
    return "elevated";
  }
  if (ownerRisk === "elevated") return "elevated";
  return "normal";
}

export function riskCallout(ixs: ParsedInstructionSummary[]): string | null {
  const kinds = new Set(ixs.map((i) => i.kind));
  if (kinds.has(PhygitalWalletInstruction.ClearAuthority)) {
    return "Removes the owner key from this accessory.";
  }
  if (kinds.has(PhygitalWalletInstruction.ClearWalletPolicy)) {
    return "Turns off all accessory spend checks. Anyone with the item can move funds until you restore protections.";
  }
  if (kinds.has(PhygitalWalletInstruction.SetWalletPolicy)) {
    return "Updates how this wallet can spend.";
  }
  if (
    kinds.has(PhygitalWalletInstruction.ExecuteWithAuthority) ||
    kinds.has(PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies)
  ) {
    return "This spend uses your owner key and can bypass accessory limits. Confirm the amount and destination carefully.";
  }
  return null;
}
