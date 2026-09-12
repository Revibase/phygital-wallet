/**
 * Map technical send / verify errors to human-facing copy.
 * Keep raw Error.message in logs; never show engineer jargon in toasts.
 */

import { PolicyDeniedError } from "phygital-wallet-sdk";

import { copy, errorCopy } from "@/lib/copy/phygital";

const DEFAULT_ERROR_BODY: string = errorCopy.fallback.body;
const DEFAULT_ERROR: UserFacingError = errorCopy.fallback;

export type UserFacingError = {
  title: string;
  body: string;
};

type Rule = {
  test: RegExp | string;
  facing: UserFacingError;
};

const RULES: Rule[] = [
  {
    test: /signature verification|signatures missing|7050012/i,
    facing: errorCopy.couldntVerify,
  },
  {
    test: /insufficient funds|insufficient lamports|not enough balance|don't have enough balance|custom program error: 0x1\b/i,
    facing: errorCopy.notEnoughMoney,
  },
  {
    test: /transaction would fail|simulation failed/i,
    facing: errorCopy.paymentFailed,
  },
  {
    test: /accessory is locked|TokenIsCurrentlyLocked|currently locked|unlock the phygital token/i,
    facing: errorCopy.accessoryLocked,
  },
  {
    test: /tap proof expired|slot hash no longer valid/i,
    facing: errorCopy.sessionEnded,
  },
  {
    test: /slot hashes|slot hash/i,
    facing: errorCopy.tryAgainBody,
  },
  {
    test: /this tap timed out|this tap was already used/i,
    facing: errorCopy.sessionEnded,
  },
  {
    test: /this is not the same NFC accessory/i,
    facing: errorCopy.wrongItem,
  },
  {
    test: /couldn't verify this NFC accessory|message mismatch/i,
    facing: errorCopy.nfcVerifyFailed,
  },
  {
    test: /isn't set up|not registered/i,
    facing: errorCopy.notSetUp,
  },
  {
    test: /missing tap parameters|verification failed|invalid signature/i,
    facing: errorCopy.nfcVerifyFailed,
  },
  {
    test: /NFC accessory not found|accessory not found|missing passkey/i,
    facing: errorCopy.itemNotFound,
  },
  {
    test: /no locked NFC accessory|add it to a wallet first/i,
    facing: errorCopy.accessoryNotReady,
  },
  {
    test: /enter a valid amount/i,
    facing: errorCopy.enterAmount,
  },
  {
    test: /amount supports at most/i,
    facing: errorCopy.amountTooPrecise,
  },
];

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function matchRule(raw: string): Rule | null {
  for (const rule of RULES) {
    if (typeof rule.test === "string") {
      if (raw.toLowerCase().includes(rule.test.toLowerCase())) return rule;
    } else if (rule.test.test(raw)) {
      return rule;
    }
  }
  return null;
}

function isAlreadyFriendly(raw: string): boolean {
  return (
    !/[_\-]{2,}|\b(sysvar|u64|PDA|ATA|RPC|D1|KV)\b/i.test(raw) &&
    raw.length < 140 &&
    !/^[A-Z][a-z]+[A-Z]/.test(raw)
  );
}

/** Technical error text before user-facing sanitization (for logs / dev UI). */
export function getRawPaymentError(error: unknown): string {
  return rawMessage(error).trim();
}

/** Write full error detail to the console (raw message is stripped in UI). */
export function logPaymentError(scope: string, error: unknown): void {
  const raw = getRawPaymentError(error);
  if (raw) {
    console.error(`[app:${scope}]`, raw, error);
    return;
  }
  if (error != null) {
    console.error(`[app:${scope}]`, error);
  }
}

function toFacing(error: unknown, fallback: UserFacingError): UserFacingError {
  const raw = rawMessage(error).trim();
  if (!raw) return fallback;

  const rule = matchRule(raw);
  if (rule) {
    return rule.facing;
  }

  if (isAlreadyFriendly(raw)) {
    return { title: fallback.title, body: raw };
  }

  if (raw !== fallback.body) logPaymentError("sanitized", error);
  return fallback;
}

/** Title + body for full-screen payment outcomes. */
export function toUserFacingError(
  error: unknown,
  fallback: UserFacingError | string = DEFAULT_ERROR_BODY,
): UserFacingError {
  const fb =
    typeof fallback === "string"
      ? { title: DEFAULT_ERROR.title, body: fallback }
      : fallback;
  return toFacing(error, fb);
}

/** Compact line for toasts and inline banners. */
export function toUserErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_ERROR_BODY,
): string {
  if (error instanceof PolicyDeniedError) {
    if (error.code === "spend_limit") return error.message;
    if (error.code === "outside_time_window") {
      return copy.wallet.approveSendBodyTime;
    }
    if (!error.soft) return copy.wallet.sendBlockedHard;
    return error.message || copy.wallet.sendBlockedHard;
  }

  const raw = rawMessage(error).trim();
  if (!raw) return fallback;

  const rule = matchRule(raw);
  if (rule) {
    return rule.facing.title;
  }

  if (isAlreadyFriendly(raw)) return raw;

  if (raw !== fallback) logPaymentError("sanitized", error);
  return fallback;
}
