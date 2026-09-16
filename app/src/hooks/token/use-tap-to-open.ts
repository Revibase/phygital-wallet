"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { tokenHref } from "@/lib/wallet/token-routes";

/** Sentinel for an unscoped "open whatever is tapped" hold. */
const ANY_TOKEN = "__any__";

/**
 * Hold an accessory, then open its token page (cookie minted by the API;
 * middleware gates `/token/[address]/**`).
 *
 * Use when the token is unknown until the tap (welcome / “open another”).
 * Known dashboard cards `router.push(tokenHref(…))` and use `/unlock` for a
 * named Hold + mismatch recovery when the cookie belongs to another item.
 */
export function useTapToOpen() {
  const router = useRouter();
  const accessory = useAccessoryHold();
  const [openingToken, setOpeningToken] = useState<string | null>(null);

  async function open() {
    setOpeningToken(ANY_TOKEN);
    try {
      const connection = await accessory.hold();
      if (connection) {
        router.push(tokenHref(connection.phygitalToken));
      }
    } finally {
      setOpeningToken(null);
    }
  }

  return {
    showInAppGate: accessory.showInAppGate,
    holding: accessory.holding,
    error: accessory.error,
    /** The token currently being opened (or ANY_TOKEN for an unscoped hold). */
    openingToken,
    open,
  };
}
