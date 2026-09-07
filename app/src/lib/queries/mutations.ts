/**
 * Post-mutation cache updates for React Query.
 *
 * Prefer invalidate for chain/API-derived balances (fees credit async via
 * webhook; portfolio shapes are hard to patch safely). Prefer setQueryData
 * only when the client already knows the exact next value (policy PUT).
 *
 * For sends/receives: applyOptimisticPortfolioDelta as soon as the RPC accepts
 * the tx; restorePortfolioSnapshot if confirmation fails; invalidate on land.
 */

import type { QueryClient } from "@tanstack/react-query";

import { formatTokenAmount, uiAmountToRaw } from "@/lib/tokens/amount";
import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import type { EffectivePolicy } from "@/lib/wallet/policies-client";

import { queryKeys } from "./keys";

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

/** Portfolio + fee balance after a send, receive, or fee top-up. */
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
    void queryClient.invalidateQueries({
      queryKey: queryKeys.walletActivity.all(),
      predicate: (query) => query.queryKey[1] === owner,
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
