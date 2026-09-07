"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queries";

/**
 * iOS often restores this tab from bfcache after an NFC tap or wallet
 * in-app browser. React Query's focus manager does not always run then,
 * so persisted token ownership can stay frozen until site data is cleared.
 *
 * Intentionally skips `walletActivity` — Helius Wallet History is expensive
 * (100 credits/req); optimistic React Query rows cover post-send UX.
 */
export function useResumeQueryRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      // Active observers only — avoid refetching every cached portfolio/token.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.phygitalToken.all(),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.walletPortfolio.all(),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.feeBalance.all(),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.walletPolicy.all(),
        refetchType: "active",
      });
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [queryClient]);
}
