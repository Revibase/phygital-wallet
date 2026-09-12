"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { address } from "@solana/kit";

import {
  fetchPhygitalToken,
  fetchPhygitalTokenByIdentifier,
  type PhygitalToken,
} from "@/lib/phygital/token";
import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

function seedPhygitalTokenCache(
  queryClient: ReturnType<typeof useQueryClient>,
  token: PhygitalToken
) {
  queryClient.setQueryData(
    queryKeys.phygitalToken.byAddress(String(token.address)),
    token
  );
  queryClient.setQueryData(
    queryKeys.phygitalToken.byIdentifier(token.identifier),
    token
  );
}

/** Load on-chain token by chip identifier (NFC URL `pk`). */
export function usePhygitalToken(identifier: string | null) {
  const queryClient = useQueryClient();
  return useQuery<PhygitalToken, Error>({
    queryKey: queryKeys.phygitalToken.byIdentifier(identifier),
    queryFn: async () => {
      if (!identifier) throw new Error("Missing identifier");
      const token = await fetchPhygitalTokenByIdentifier(
        getSolanaRpc(),
        identifier
      );
      seedPhygitalTokenCache(queryClient, token);
      return token;
    },
    enabled: Boolean(identifier),
    ...queryOptions.volatile,
  });
}

/** Load on-chain token by PDA. */
export function usePhygitalTokenByAddress(tokenAddress: string | null) {
  const queryClient = useQueryClient();
  return useQuery<PhygitalToken, Error>({
    queryKey: queryKeys.phygitalToken.byAddress(tokenAddress),
    queryFn: async () => {
      if (!tokenAddress) throw new Error("Missing token");
      const token = await fetchPhygitalToken(
        getSolanaRpc(),
        address(tokenAddress)
      );
      seedPhygitalTokenCache(queryClient, token);
      return token;
    },
    enabled: Boolean(tokenAddress),
    ...queryOptions.volatile,
  });
}
