"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { queryKeys } from "@/lib/queries";
import { tokenHref } from "@/lib/wallet/token-routes";

/** Sentinel for an unscoped "open whatever is tapped" hold. */
const ANY_TOKEN = "__any__";

/**
 * Tap an accessory, then open its token page — the browse-unlock cookie the
 * Hold mints is what gates the wallet routes. Pass a token to require that the
 * tapped accessory matches (dashboard cards); omit it to open whatever is
 * tapped (welcome / "open another").
 */
export function useTapToOpen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessory = useAccessoryHold();
  const [openingToken, setOpeningToken] = useState<string | null>(null);

  async function open(expectedPhygitalToken?: string) {
    setOpeningToken(expectedPhygitalToken ?? ANY_TOKEN);
    try {
      const connection = await accessory.hold(
        expectedPhygitalToken ? { expectedPhygitalToken } : undefined
      );
      if (connection) {
        queryClient.setQueryData(
          queryKeys.browseUnlock.byToken(connection.phygitalToken),
          true
        );
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
