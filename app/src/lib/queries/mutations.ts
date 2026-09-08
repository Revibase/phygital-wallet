/**
 * Post-mutation cache updates for React Query.
 *
 * Prefer setQueryData when the client already knows the next value (policy
 * PUT, optimistic portfolio/activity/fee/settings patches). Prefer invalidate
 * for shapes that are hard to patch safely, or when refreshing after an error
 * gate (e.g. insufficient fee balance). For sends/receives/fee top-ups/config:
 * patch on RPC accept, restore on failed confirm — do not invalidate on land.
 */

import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { formatTokenAmount, uiAmountToRaw } from "@/lib/tokens/amount";
import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type {
  WalletActivityItem,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";
import type { EffectivePolicy } from "@/lib/wallet/policies-client";
import {
  FEE_BALANCE_LOW_LAMPORTS,
  lamportsToSolUi,
} from "@/lib/wallet/network-fee";

import { queryKeys } from "./keys";

/** Mirrors `useRecoveryWallet` query data. */
export type RecoveryWalletCache = {
  configured: boolean;
  recoveryWallet: string | null;
  payer: string | null;
};

/** Mirrors `useTokenVerifier` query data. */
export type TokenVerifierCache = {
  custom: boolean;
  verifier: string | null;
  endpoint: string | null;
  payer: string | null;
};

/** First-page sizes used by `useWalletActivity` (default) and ActivityAllSheet. */
const ACTIVITY_FIRST_PAGE_LIMITS = [20, 40] as const;

type WalletActivityPage = {
  items: WalletActivityItem[];
  nextCursor: string | null;
};

export type WalletActivitySnapshot = Array<{
  queryKey: QueryKey;
  previous: WalletActivityPage | undefined;
}>;

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function cachedTokenAddress(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("address" in data)) return null;
  const address = (data as { address: unknown }).address;
  return address == null ? null : String(address);
}

function adjustHolding(
  holding: PaymentTokenHolding,
  amountUi: string,
  direction: "in" | "out",
): PaymentTokenHolding {
  try {
    const delta = uiAmountToRaw(amountUi, holding.decimals);
    const current = BigInt(holding.balanceRaw);
    const nextRaw =
      direction === "out"
        ? current > delta
          ? current - delta
          : 0n
        : current + delta;
    const balanceUi = formatTokenAmount(nextRaw, holding.decimals);
    const valueUsd =
      holding.pricePerTokenUsd != null
        ? Number(balanceUi) * holding.pricePerTokenUsd
        : holding.valueUsd;
    return {
      ...holding,
      balanceRaw: nextRaw.toString(),
      balanceUi,
      valueUsd,
    };
  } catch {
    return holding;
  }
}

/**
 * Light optimistic portfolio patch. Returns the previous cache value so callers
 * can restorePortfolioSnapshot if the tx does not land.
 */
export function applyOptimisticPortfolioDelta(
  queryClient: QueryClient,
  args: {
    owner: string;
    mint: string;
    amountUi: string;
    direction: "in" | "out";
    /** Remove collectible from cache instead of adjusting a fungible holding. */
    removeCollectible?: boolean;
  },
): WalletPortfolio | undefined {
  const key = queryKeys.walletPortfolio.byOwner(args.owner);
  const previous = queryClient.getQueryData<WalletPortfolio>(key);
  queryClient.setQueryData<WalletPortfolio>(key, (prev) => {
    if (!prev) return prev;
    if (args.removeCollectible) {
      return {
        ...prev,
        collectibles: prev.collectibles.filter((c) => c.mint !== args.mint),
      };
    }
    return {
      ...prev,
      holdings: prev.holdings.map((h) =>
        h.mint === args.mint
          ? adjustHolding(h, args.amountUi, args.direction)
          : h,
      ),
    };
  });
  return previous;
}

/** Undo applyOptimisticPortfolioDelta after a failed confirmation. */
export function restorePortfolioSnapshot(
  queryClient: QueryClient,
  owner: string,
  previous: WalletPortfolio | undefined,
): void {
  const key = queryKeys.walletPortfolio.byOwner(owner);
  if (previous === undefined) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

const SOL_DECIMALS = 9;

/**
 * Credit or debit prepaid network fees. Returns the previous cache value so
 * callers can restoreFeeBalanceSnapshot if the tx does not land.
 */
export function applyOptimisticFeeBalance(
  queryClient: QueryClient,
  args: {
    token: string;
    amountUi: string;
    direction: "in" | "out";
  },
): FeeBalance | undefined {
  const key = queryKeys.feeBalance.byToken(args.token);
  const previous = queryClient.getQueryData<FeeBalance>(key);
  queryClient.setQueryData<FeeBalance>(key, (prev) => {
    try {
      const delta = Number(uiAmountToRaw(args.amountUi, SOL_DECIMALS));
      if (!Number.isFinite(delta) || delta <= 0) return prev;
      const current = prev?.balanceLamports ?? 0;
      const nextLamports =
        args.direction === "out"
          ? Math.max(0, current - delta)
          : current + delta;
      return {
        balanceLamports: nextLamports,
        balanceUi: lamportsToSolUi(nextLamports),
        low: nextLamports < FEE_BALANCE_LOW_LAMPORTS,
      };
    } catch {
      return prev;
    }
  });
  return previous;
}

/** Undo applyOptimisticFeeBalance after a failed confirmation. */
export function restoreFeeBalanceSnapshot(
  queryClient: QueryClient,
  token: string,
  previous: FeeBalance | undefined,
): void {
  const key = queryKeys.feeBalance.byToken(token);
  if (previous === undefined) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

function isOwnerActivityFirstPage(
  queryKey: readonly unknown[],
  owner: string,
): boolean {
  return (
    queryKey[0] === "walletActivity" &&
    queryKey[1] === owner &&
    queryKey[3] == null
  );
}

function prependActivityItem(
  page: WalletActivityPage | undefined,
  item: WalletActivityItem,
): WalletActivityPage {
  return {
    items: [item, ...(page?.items ?? []).filter((row) => row.id !== item.id)],
    nextCursor: page?.nextCursor ?? null,
  };
}

/**
 * Insert a pending activity row into first-page caches (same lifecycle as
 * applyOptimisticPortfolioDelta). Returns snapshots for restore on failure.
 */
export function applyOptimisticWalletActivity(
  queryClient: QueryClient,
  item: WalletActivityItem,
): WalletActivitySnapshot {
  const keys = new Map<string, QueryKey>();
  const addKey = (queryKey: QueryKey) => {
    keys.set(JSON.stringify(queryKey), queryKey);
  };

  for (const query of queryClient.getQueryCache().findAll({
    queryKey: queryKeys.walletActivity.all(),
  })) {
    if (isOwnerActivityFirstPage(query.queryKey, item.walletAddress)) {
      addKey(query.queryKey);
    }
  }
  for (const limit of ACTIVITY_FIRST_PAGE_LIMITS) {
    addKey(queryKeys.walletActivity.byOwner(item.walletAddress, limit, null));
  }

  const snapshot: WalletActivitySnapshot = [];
  for (const queryKey of keys.values()) {
    snapshot.push({
      queryKey,
      previous: queryClient.getQueryData<WalletActivityPage>(queryKey),
    });
    queryClient.setQueryData<WalletActivityPage>(queryKey, (prev) =>
      prependActivityItem(prev, item),
    );
  }
  return snapshot;
}

/** Mark an optimistic activity row confirmed (or failed) without a refetch. */
export function patchOptimisticWalletActivity(
  queryClient: QueryClient,
  args: {
    owner: string;
    id: string;
    patch: Partial<WalletActivityItem>;
  },
): void {
  queryClient.setQueriesData<WalletActivityPage>(
    {
      queryKey: queryKeys.walletActivity.all(),
      predicate: (query) =>
        isOwnerActivityFirstPage(query.queryKey, args.owner),
    },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === args.id ? { ...item, ...args.patch } : item,
        ),
      };
    },
  );
}

/** Undo applyOptimisticWalletActivity after a failed confirmation. */
export function restoreWalletActivitySnapshot(
  queryClient: QueryClient,
  snapshot: WalletActivitySnapshot | undefined,
): void {
  if (!snapshot) return;
  for (const { queryKey, previous } of snapshot) {
    if (previous === undefined) {
      queryClient.removeQueries({ queryKey });
      continue;
    }
    queryClient.setQueryData(queryKey, previous);
  }
}

/**
 * Portfolio + fee balance. Does **not** touch wallet activity (Helius history
 * is expensive; optimistic rows cover post-send UX).
 */
export function invalidateWalletBalances(
  queryClient: QueryClient,
  args: {
    wallets?: Array<string | null | undefined>;
    tokens?: Array<string | null | undefined>;
  },
): void {
  for (const owner of uniq(args.wallets ?? [])) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.walletPortfolio.byOwner(owner),
    });
  }
  for (const token of uniq(args.tokens ?? [])) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.feeBalance.byToken(token),
    });
  }
}

/** On-chain token account changed (signing settings, ownership, etc.). */
export function invalidatePhygitalToken(
  queryClient: QueryClient,
  tokenAddress?: string | null,
): void {
  if (!tokenAddress) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.phygitalToken.all(),
    });
    return;
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.phygitalToken.all(),
    predicate: (query) => {
      const key = query.queryKey;
      if (key[1] === "address" && key[2] === tokenAddress) return true;
      return cachedTokenAddress(query.state.data) === tokenAddress;
    },
  });
}

/**
 * Replace the shared policy cache after PUT/DELETE.
 */
export function applyWalletPolicy(
  queryClient: QueryClient,
  phygitalToken: string,
  effective: EffectivePolicy,
): void {
  queryClient.setQueryData(
    queryKeys.walletPolicy.byToken(phygitalToken),
    effective,
  );
}

/**
 * Patch recovery-wallet settings on RPC accept. Returns previous for restore.
 */
export function applyOptimisticRecoveryWallet(
  queryClient: QueryClient,
  token: string,
  next: RecoveryWalletCache,
): RecoveryWalletCache | undefined {
  const key = queryKeys.recoveryWallet.byToken(token);
  const previous = queryClient.getQueryData<RecoveryWalletCache>(key);
  queryClient.setQueryData(key, next);
  return previous;
}

export function restoreRecoveryWalletSnapshot(
  queryClient: QueryClient,
  token: string,
  previous: RecoveryWalletCache | undefined,
): void {
  const key = queryKeys.recoveryWallet.byToken(token);
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

/**
 * Patch token-verifier override on RPC accept. Returns previous for restore.
 */
export function applyOptimisticTokenVerifier(
  queryClient: QueryClient,
  token: string,
  next: TokenVerifierCache,
): TokenVerifierCache | undefined {
  const key = queryKeys.tokenVerifier.byToken(token);
  const previous = queryClient.getQueryData<TokenVerifierCache>(key);
  queryClient.setQueryData(key, next);
  void queryClient.invalidateQueries({
    queryKey: queryKeys.resolvedVerifier.byToken(token),
  });
  return previous;
}

export function restoreTokenVerifierSnapshot(
  queryClient: QueryClient,
  token: string,
  previous: TokenVerifierCache | undefined,
): void {
  const key = queryKeys.tokenVerifier.byToken(token);
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey: key });
  } else {
    queryClient.setQueryData(key, previous);
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.resolvedVerifier.byToken(token),
  });
}

/** Invalidate DAS / portfolio caches when the active RPC preference changes. */
export function invalidateRpcDependentQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.walletPortfolio.all(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.dasCollectible.all(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.mintedCollectibleView.all(),
  });
}
