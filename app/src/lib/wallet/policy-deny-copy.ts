import { PolicyDeniedError } from "phygital-wallet-sdk";

import { copy } from "@/lib/copy/phygital";
import { formatTokenAmount } from "@/lib/tokens/amount";
import { shortAddress } from "@/lib/utils";

export function policySoftDenyBody(deny: PolicyDeniedError): string {
  if (deny.code === "spend_limit") {
    const limit =
      typeof deny.details?.limitUi === "string" ? deny.details.limitUi : null;
    return limit ? copy.wallet.approveSendBodyLimit(limit) : deny.message;
  }
  if (deny.code === "recipient_not_allowed") {
    return copy.wallet.approveSendBodyRecipient;
  }
  if (deny.code === "recipient_denied") {
    return copy.wallet.approveSendBodyRecipientDenied;
  }
  if (deny.code === "outside_time_window") {
    return copy.wallet.approveSendBodyTime;
  }
  if (deny.code === "approval_required") {
    return copy.wallet.approveSendBodyApproval;
  }
  if (deny.code === "instruction_not_allowed") {
    return deny.message || copy.wallet.approveSendBodyInstruction;
  }
  if (deny.code === "program_not_allowed") {
    return copy.wallet.approveSendBodyProgram;
  }
  if (deny.code === "unexpected_instruction") {
    return copy.wallet.approveSendBodyUnexpected;
  }
  return deny.message;
}

/** Hero amount line for soft-deny / open-approval sheets. */
export function policyAmountLabel(
  details: Record<string, unknown> | null | undefined,
  fallbackSymbol?: string | null,
): string | undefined {
  if (!details) return undefined;
  const amountUi =
    typeof details.amountUi === "string" ? details.amountUi : null;
  if (!amountUi) return undefined;
  const symbol =
    typeof details.symbol === "string"
      ? details.symbol
      : fallbackSymbol?.trim() || null;
  return symbol ? `${amountUi} ${symbol}` : amountUi;
}

/** Short recipient line for the approval sheet hero. */
export function policyRecipientLabel(
  details: Record<string, unknown> | null | undefined,
): string | undefined {
  const destination =
    typeof details?.destination === "string" ? details.destination : null;
  return destination ? shortAddress(destination, 6) : undefined;
}

/** Structured rows for Approve-once (destination / amount / mint / program). */
export function policyApprovalDetailRows(
  details: Record<string, unknown> | null | undefined,
  options?: {
    omitAmount?: boolean;
    /** When recipient is already shown in the hero recap. */
    omitDestination?: boolean;
    /** Prefer symbol over truncated mint when known. */
    tokenLabel?: string | null;
    /** When symbol is already on the amount line. */
    omitMint?: boolean;
    /** Hide Action / Program for clear send approvals. */
    omitTechnical?: boolean;
  },
): { label: string; value: string }[] {
  if (!details) return [];
  const rows: { label: string; value: string }[] = [];

  const destination =
    typeof details.destination === "string" ? details.destination : null;
  if (destination && !options?.omitDestination) {
    rows.push({
      label: copy.wallet.approveSendDestination,
      value: shortAddress(destination, 6),
    });
  }

  if (!options?.omitAmount) {
    const amountUi =
      typeof details.amountUi === "string" ? details.amountUi : null;
    const requestedUi =
      typeof details.requestedUi === "string" ? details.requestedUi : null;
    const amount = typeof details.amount === "string" ? details.amount : null;
    const decimals =
      typeof details.decimals === "number" ? details.decimals : null;

    let displayAmount: string | null = amountUi;
    if (!displayAmount && requestedUi) {
      // USDC spend-limit enrichment is dollar-denominated.
      displayAmount = `$${requestedUi}`;
    }
    if (!displayAmount && amount != null && decimals != null && decimals >= 0) {
      try {
        displayAmount = formatTokenAmount(BigInt(amount), decimals);
      } catch {
        /* ignore malformed raw amount */
      }
    }
    if (displayAmount) {
      rows.push({
        label: copy.wallet.approveSendAmount,
        value: displayAmount,
      });
    }
  }

  const mint = typeof details.mint === "string" ? details.mint : null;
  const tokenLabel = options?.tokenLabel?.trim() || null;
  if (!options?.omitMint) {
    if (tokenLabel) {
      rows.push({
        label: copy.wallet.approveSendMint,
        value: tokenLabel,
      });
    } else if (mint) {
      rows.push({
        label: copy.wallet.approveSendMint,
        value: shortAddress(mint, 4),
      });
    }
  }

  if (!options?.omitTechnical) {
    const instructionName =
      typeof details.instructionName === "string"
        ? details.instructionName
        : null;
    if (instructionName) {
      rows.push({
        label: copy.wallet.approveSendInstruction,
        value: instructionName,
      });
    }

    const programId =
      typeof details.programId === "string" ? details.programId : null;
    if (programId) {
      rows.push({
        label: copy.wallet.approveSendProgram,
        value: shortAddress(programId, 4),
      });
    }
  }

  return rows;
}
