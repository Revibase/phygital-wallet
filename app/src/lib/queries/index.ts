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
  applyOptimisticRecoveryWallet,
  applyOptimisticTokenVerifier,
  applyOptimisticWalletActivity,
  applyWalletPolicy,
  invalidatePhygitalToken,
  invalidateRpcDependentQueries,
  invalidateWalletBalances,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreRecoveryWalletSnapshot,
  restoreTokenVerifierSnapshot,
  restoreWalletActivitySnapshot,
  type RecoveryWalletCache,
  type TokenVerifierCache,
  type WalletActivitySnapshot,
} from "./mutations";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const queryOptions = {
  /**
   * On-chain token accounts. Short stale window + focus refetch; hard refresh
   * via useResumeQueryRefresh / ownership mutations — not every remount.
   */
  volatile: {
    staleTime: 30 * SECOND,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  /**
   * Device access cookie (~15m; refresh renews silently). Short stale window
   * avoids remount churn while still refreshing on focus near expiry.
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
   * Activity via getTransactionsForAddress — only mounted on the Activity screen.
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
