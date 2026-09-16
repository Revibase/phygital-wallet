"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { address } from "@solana/kit";

import {
  fetchPhygitalTokensByAddresses,
  tokenHasLinkedMint,
  type PhygitalToken,
} from "@/lib/phygital/token";
import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { fetchDasCollectiblesClient } from "@/lib/tokens/das-collectible-client";
import type { Collectible } from "@/lib/tokens/collectible";

export type OwnedAccessoryDetails = {
  tokens: Map<string, PhygitalToken>;
  collectibles: Record<string, Collectible | null>;
};

/**
 * One RPC round-trip for all accessory PDAs + one DAS batch for linked mints.
 * Seeds per-address / per-mint query caches so cards don't refetch.
 */
export function useOwnedAccessoryDetails(tokenPdas: string[] | undefined) {
  const queryClient = useQueryClient();
  const sortedKey = tokenPdas?.length
    ? [...tokenPdas].sort().join(",")
    : "";

  return useQuery<OwnedAccessoryDetails>({
    queryKey: [...queryKeys.ownedAccessories.all(), "details", sortedKey],
    enabled: Boolean(tokenPdas && tokenPdas.length > 0),
    queryFn: async () => {
      const pdas = tokenPdas ?? [];
      const addrs = pdas.map((t) => address(t));
      const tokens = await fetchPhygitalTokensByAddresses(getSolanaRpc(), addrs);

      for (const token of tokens.values()) {
        queryClient.setQueryData(
          queryKeys.phygitalToken.byAddress(String(token.address)),
          token,
        );
        queryClient.setQueryData(
          queryKeys.phygitalToken.byIdentifier(token.identifier),
          token,
        );
      }

      const mints = [
        ...new Set(
          [...tokens.values()]
            .filter(tokenHasLinkedMint)
            .map((t) => String(t.mint)),
        ),
      ];
      const collectibles = await fetchDasCollectiblesClient(mints);
      for (const [mint, collectible] of Object.entries(collectibles)) {
        queryClient.setQueryData(
          queryKeys.dasCollectible.byMint(mint),
          collectible,
        );
      }

      return { tokens, collectibles };
    },
    ...queryOptions.volatile,
  });
}
