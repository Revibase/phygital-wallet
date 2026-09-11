"use client";

import { useState } from "react";

import { useIsInAppBrowser } from "@/hooks/layout/use-is-in-app-browser";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { completeAccessoryConnection } from "@/lib/wallet/connect-accessory";
import { AccessoryMismatchError } from "phygital-wallet-sdk";

/**
 * Shared Hold gate: in-app browser check + accessory WebAuthn + busy/error.
 * Used by cold `/token` Hold and address Hold-before-wallet.
 */
export function useAccessoryHold() {
  const inApp = useIsInAppBrowser();
  const [pending, setPending] = useState(false);
  const [showInAppGate, setShowInAppGate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hold(args?: { expectedPhygitalToken?: string }) {
    if (inApp) {
      setShowInAppGate(true);
      return null;
    }
    setError(null);
    setPending(true);
    try {
      return await completeAccessoryConnection(args);
    } catch (e) {
      setError(
        toUserErrorMessage(
          e instanceof AccessoryMismatchError
            ? new Error(copy.token.wrongItem)
            : e,
          copy.verify.failedBody,
        ),
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  return {
    showInAppGate,
    holding: pending,
    error,
    setError,
    hold,
  };
}
