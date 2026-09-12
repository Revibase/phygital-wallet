"use client";

import { useEffect, useRef, useState } from "react";

import { useAuthenticateToken } from "@/hooks/token/use-authenticate-token";
import { useIsInAppBrowser } from "@/hooks/layout/use-is-in-app-browser";
import { copy } from "@/lib/copy/phygital";
import type { PhygitalToken } from "@/lib/phygital/token";
import { toUserErrorMessage } from "@/lib/user-errors";

const RECHECK_SUCCESS_MS = 2800;

export type HoldToCheckOverlay =
  | null
  | "pending"
  | "recheck-success"
  | "failed";

/**
 * Hold-to-verify + Verified badge.
 *
 * `liveConfirmed` is true only after a successful `startAuthentication` /
 * verifyResponse in this page session — never from browse unlock alone.
 */
export function useHoldToCheck(token: PhygitalToken) {
  const inApp = useIsInAppBrowser();
  const { authenticate } = useAuthenticateToken();

  const [holdConfirmed, setHoldConfirmed] = useState(false);
  const [overlay, setOverlay] = useState<HoldToCheckOverlay>(null);
  const [showInAppGate, setShowInAppGate] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const recheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (recheckTimer.current) clearTimeout(recheckTimer.current);
    };
  }, []);

  async function holdToCheck() {
    if (inApp) {
      setShowInAppGate(true);
      return;
    }

    setHoldError(null);
    setOverlay("pending");

    try {
      await authenticate({
        expectedPublicKey: token.secp256r1PublicKey,
      });
      setHoldConfirmed(true);
      setOverlay("recheck-success");
      if (recheckTimer.current) clearTimeout(recheckTimer.current);
      recheckTimer.current = setTimeout(() => {
        setOverlay(null);
      }, RECHECK_SUCCESS_MS);
    } catch (err) {
      setHoldError(toUserErrorMessage(err, copy.verify.failedBody));
      setOverlay("failed");
    }
  }

  return {
    liveConfirmed: holdConfirmed,
    overlay,
    holdError,
    showInAppGate,
    holdToCheck,
  };
}
