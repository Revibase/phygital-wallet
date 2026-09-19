"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { address } from "@solana/kit";

import {
  fetchPhygitalTokensByAddresses,
  type PhygitalToken,
} from "@/lib/phygital/token";
import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

export type OwnedAccessoryDetails = {
  tokens: Map<string, PhygitalToken>;
};

/**
 * One RPC round-trip for all accessory PDAs. Seeds per-address query caches so
 * cards don't refetch.
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

      return { tokens };
    },
    ...queryOptions.volatile,
  });
}
