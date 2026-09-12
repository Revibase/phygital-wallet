"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchDasCollectibleClient } from "@/lib/tokens/das-collectible-client";
import {
  fallbackCollectible,
  type Collectible,
} from "@/lib/tokens/collectible";

export function useDasCollectible(
  mint: string | null,
  opts?: { enabled?: boolean },
) {
  return useQuery<Collectible | null, Error>({
    queryKey: queryKeys.dasCollectible.byMint(mint),
    queryFn: () => {
      if (!mint) return null;
      return fetchDasCollectibleClient(mint);
    },
    enabled: Boolean(mint) && opts?.enabled !== false,
    ...queryOptions.stable,
  });
}

/** DAS metadata with fallback placeholder once the query has settled. */
export function useResolvedDasCollectible(
  mint: string | null,
  opts?: { enabled?: boolean },
) {
  const das = useDasCollectible(mint, opts);
  const collectible =
    das.data ?? (das.isFetched && mint ? fallbackCollectible(mint) : null);
  const loading = das.isLoading && !das.isFetched;
  return { collectible, loading };
}
