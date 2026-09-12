"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";
import { fetchWalletActivity } from "@/lib/wallet/activity-client";
import { useActivityMintMeta, type MintMeta } from "./use-activity-mint-meta";

const EMPTY_ACTIVITY: WalletActivityItem[] = [];

export function useWalletActivity(
  walletAddress: string | null,
  limit = 20,
  cursor?: string | null
) {
  const remote = useQuery({
    queryKey: queryKeys.walletActivity.byOwner(walletAddress, limit, cursor),
    queryFn: () =>
      fetchWalletActivity({
        walletAddress: walletAddress!,
        limit,
        cursor,
      }),
    enabled: Boolean(walletAddress),
    ...queryOptions.activity,
  });

  const items = remote.data?.items ?? EMPTY_ACTIVITY;
  const mintMeta: Record<string, MintMeta> = useActivityMintMeta(items);

  return {
    ...remote,
    items,
    mintMeta,
    nextCursor: remote.data?.nextCursor ?? null,
  };
}
