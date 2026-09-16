"use client";

import { useState } from "react";

import { useIsInAppBrowser } from "@/hooks/layout/use-is-in-app-browser";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  AccessoryMismatchError,
  connectAccessory,
  type AccessoryConnection,
} from "@/lib/wallet/connect-accessory";

export type AccessoryHoldMismatch = {
  heldPhygitalToken: string;
  expectedPhygitalToken: string;
};

/**
 * Shared Hold gate: in-app browser check + accessory WebAuthn + busy/error.
 * When an expected token is set and a different accessory is held, exposes
 * {@link mismatch} for recovery UI instead of a dead-end error.
 */
export function useAccessoryHold() {
  const inApp = useIsInAppBrowser();
  const [pending, setPending] = useState(false);
  const [showInAppGate, setShowInAppGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<AccessoryHoldMismatch | null>(null);

  async function hold(args?: {
    expectedPhygitalToken?: string;
  }): Promise<AccessoryConnection | null> {
    if (inApp) {
      setShowInAppGate(true);
      return null;
    }
    setError(null);
    setMismatch(null);
    setPending(true);
    try {
      return await connectAccessory(args);
    } catch (e) {
      if (e instanceof AccessoryMismatchError) {
        setMismatch({
          heldPhygitalToken: e.heldPhygitalToken,
          expectedPhygitalToken: e.expectedPhygitalToken,
        });
        return null;
      }
      setError(toUserErrorMessage(e, copy.verify.failedBody));
      return null;
    } finally {
      setPending(false);
    }
  }

  function clearMismatch() {
    setMismatch(null);
  }

  return {
    showInAppGate,
    holding: pending,
    error,
    setError,
    mismatch,
    clearMismatch,
    hold,
  };
}
