"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";
import { dasGetAssetBatch } from "@/lib/solana/das-rpc";
import type {
  WalletActivityItem,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";

export type MintMeta = { symbol: string; name: string };

const SOL_META: MintMeta = { symbol: "SOL", name: "Solana" };

function collectActivityMints(items: WalletActivityItem[]): string[] {
  const mints = new Set<string>();
  for (const item of items) {
    if (item.mint && item.mint !== NATIVE_SOL_MINT) mints.add(item.mint);
    for (const d of item.balanceDeltas ?? []) {
      if (d.mint !== NATIVE_SOL_MINT) mints.add(d.mint);
    }
  }
  return [...mints].sort();
}

function metaFromPortfolio(
  queryClient: ReturnType<typeof useQueryClient>
): Record<string, MintMeta> {
  const map: Record<string, MintMeta> = {};
  for (const [, portfolio] of queryClient.getQueriesData<WalletPortfolio>({
    queryKey: queryKeys.walletPortfolio.all(),
  })) {
    if (!portfolio) continue;
    for (const h of portfolio.holdings) {
      map[h.mint] ??= { symbol: h.symbol, name: h.name };
    }
    for (const c of portfolio.collectibles) {
      map[c.mint] ??= { symbol: c.name, name: c.name };
    }
  }
  return map;
}

/**
 * Resolve mint symbol/name. SOL is local; portfolio cache seeds known holdings;
 * only uncached mints hit DAS (batched), written through to per-mint keys.
 */
export function useMintMeta(mints: string[]): Record<string, MintMeta> {
  const queryClient = useQueryClient();
  const allMints = useMemo(
    () => [...new Set(mints.filter((m) => m && m !== NATIVE_SOL_MINT))].sort(),
    [mints]
  );

  const seeded = useMemo(() => {
    const map: Record<string, MintMeta> = {
      [NATIVE_SOL_MINT]: SOL_META,
      SOL: SOL_META,
      ...metaFromPortfolio(queryClient),
    };
    for (const mint of allMints) {
      const cached = queryClient.getQueryData<MintMeta>(
        queryKeys.activityMintMeta.byMint(mint)
      );
      if (cached) map[mint] = cached;
    }
    return map;
  }, [allMints, queryClient]);

  const missingMints = useMemo(
    () => allMints.filter((mint) => !(mint in seeded)),
    [allMints, seeded]
  );

  const batch = useQuery({
    queryKey: queryKeys.activityMintMeta.byMints(missingMints),
    queryFn: async () => {
      if (missingMints.length === 0) return {};
      const assets = await dasGetAssetBatch(missingMints);
      const map: Record<string, MintMeta> = {};
      for (const asset of assets) {
        const id = asset.id?.trim();
        if (!id) continue;
        const tokenInfo = asset.token_info as { symbol?: string } | undefined;
        const symbol =
          tokenInfo?.symbol?.trim() ||
          asset.content?.metadata?.symbol?.trim() ||
          id.slice(0, 4);
        const name = asset.content?.metadata?.name?.trim() || symbol;
        const meta = { symbol, name };
        map[id] = meta;
        queryClient.setQueryData(queryKeys.activityMintMeta.byMint(id), meta);
      }
      return map;
    },
    enabled: missingMints.length > 0,
    ...queryOptions.stable,
  });

  return useMemo(
    () => ({
      ...seeded,
      ...(batch.data ?? {}),
    }),
    [seeded, batch.data]
  );
}

/**
 * Resolve activity mint symbol/name via {@link useMintMeta}.
 */
export function useActivityMintMeta(
  items: WalletActivityItem[]
): Record<string, MintMeta> {
  const mints = useMemo(() => collectActivityMints(items), [items]);
  return useMintMeta(mints);
}
