/**
 * React Query keys, fetchers, and staleTime presets.
 *
 * Browser HTTP always goes through `queryFetch` (`cache: "no-store"`).
 * React Query is the only client cache.
 */

export { shouldRetryQuery } from "./http";
export { queryKeys } from "./keys";
export {
  applyOptimisticFeeBalance,
  applyOptimisticPortfolioDelta,
  applyOptimisticWalletActivity,
  applyWalletPolicy,
  invalidatePhygitalToken,
  invalidateRpcDependentQueries,
  invalidateWalletBalances,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "./mutations";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const queryOptions = {
  /**
   * Ownership / token accounts that change in another browser (wallet IAB)
   * or via an NFC tap that cannot invalidate this tab's cache. Persist may
   * paint instantly; always refetch on mount/focus/reconnect.
   */
  volatile: {
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  /**
   * Device session cookie (~30m). Short stale window avoids remount churn
   * while still refreshing on focus after expiry nearby.
   */
  deviceSession: {
    staleTime: 60 * SECOND,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  /**
   * Owned links / link status. Invalidate on link/unlink; otherwise allow a
   * brief cache so home ↔ token navigation does not always re-GET.
   */
  deviceLinks: {
    staleTime: 30 * SECOND,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  /** Browse-unlock cookie (~5m). Short stale; refetch on focus near expiry. */
  browseUnlock: {
    staleTime: 30 * SECOND,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  /** Changes after user actions; mutations already invalidate. */
  default: { refetchOnWindowFocus: false, staleTime: 5 * MINUTE },
  /**
   * Costly Helius Wallet History — only mounted on the Activity screen.
   * Same short stale window as portfolio; no focus refetch while on the tab.
   */
  activity: {
    staleTime: 5 * MINUTE,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
  /** Catalog / rarely changing metadata. */
  stable: { refetchOnWindowFocus: false, staleTime: 15 * MINUTE },
  /** One-shot proofs / immutable chain metadata — never refetch. */
  immutable: {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
  },
} as const;
