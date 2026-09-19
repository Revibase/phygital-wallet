import { PolicyDeniedError } from "phygital-wallet-sdk";

import { copy } from "@/lib/copy/phygital";
import { shortAddress } from "@/lib/utils";

export function policySoftDenyBody(deny: PolicyDeniedError): string {
  if (deny.code === "spend_limit") {
    const limit =
      typeof deny.details?.limitUi === "string" ? deny.details.limitUi : null;
    return limit
      ? copy.wallet.approveSendBodyLimit(limit)
      : copy.wallet.approveSendBodyFallback;
  }
  if (deny.code === "instruction_not_allowed") {
    return copy.wallet.approveSendBodyInstruction;
  }
  if (deny.code === "program_not_allowed") {
    return copy.wallet.approveSendBodyProgram;
  }
  if (deny.code === "mint_not_allowed") {
    return copy.wallet.approveSendBodyMint;
  }
  if (deny.code === "unexpected_instruction") {
    return copy.wallet.approveSendBodyUnexpected;
  }
  return copy.wallet.approveSendBodyFallback;
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
