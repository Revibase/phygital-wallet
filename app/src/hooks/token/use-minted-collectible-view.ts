"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchMintedCollectibleViewClient } from "@/lib/tokens/minted-collectible-view-client";
import { fallbackCollectible } from "@/lib/tokens/collectible";
import type { CollectibleShortcut } from "@/lib/tokens/shortcuts";

/** Minted landing: DAS collectible + shortcuts. */
export function useMintedCollectibleView(mint: string | null) {
  const queryClient = useQueryClient();

  const viewQuery = useQuery({
    queryKey: queryKeys.mintedCollectibleView.byMint(mint),
    queryFn: async () => {
      if (!mint) {
        return {
          collectible: null,
          shortcuts: [] as CollectibleShortcut[],
        };
      }
      const view = await fetchMintedCollectibleViewClient(mint);
      queryClient.setQueryData(
        queryKeys.dasCollectible.byMint(mint),
        view.collectible,
      );
      return view;
    },
    enabled: Boolean(mint),
    ...queryOptions.stable,
  });

  const collectible =
    viewQuery.data?.collectible ??
    (viewQuery.isFetched && mint ? fallbackCollectible(mint) : null);
  const shortcuts: CollectibleShortcut[] = viewQuery.data?.shortcuts ?? [];
  const loading = viewQuery.isLoading && !viewQuery.isFetched;

  return {
    collectible,
    shortcuts,
    loading,
  };
}
