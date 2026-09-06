"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";
import { fetchWalletActivity } from "@/lib/wallet/activity-client";
import {
  listLocalWalletActivity,
  subscribeLocalWalletActivity,
} from "@/lib/wallet/activity-local";
import { useActivityMintMeta, type MintMeta } from "./use-activity-mint-meta";

const EMPTY_ACTIVITY: WalletActivityItem[] = [];

export function useWalletActivity(
  walletAddress: string | null,
  limit = 20,
  before?: string | null,
) {
  const remote = useQuery({
    queryKey: queryKeys.walletActivity.byOwner(walletAddress, limit, before),
    queryFn: () =>
      fetchWalletActivity({
        walletAddress: walletAddress!,
        limit,
        before,
      }),
    enabled: Boolean(walletAddress),
    ...queryOptions.activity,
  });

  const local = useSyncExternalStore(
    subscribeLocalWalletActivity,
    () => listLocalWalletActivity(walletAddress),
    () => EMPTY_ACTIVITY,
  );

  const items = useMemo(() => {
    const byId = new Map<string, WalletActivityItem>();
    for (const item of remote.data?.items ?? EMPTY_ACTIVITY) {
      byId.set(item.id, item);
    }
    for (const item of local) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return [...byId.values()].sort(
      (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
    );
  }, [local, remote.data?.items]);

  const mintMeta: Record<string, MintMeta> = useActivityMintMeta(items);

  return {
    ...remote,
    items,
    mintMeta,
    nextCursor: remote.data?.nextCursor ?? null,
  };
}
