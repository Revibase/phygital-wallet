"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchOwnedAccessories } from "@/lib/wallet/owned-accessories-client";

/**
 * Every phygital token the signed-in ed25519 authority controls on-chain.
 * Client-side GPA — needs no session, only the authority address.
 */
export function useOwnedAccessories(authority: string | null) {
  return useQuery({
    queryKey: queryKeys.ownedAccessories.byAuthority(authority),
    queryFn: () => fetchOwnedAccessories(authority!),
    enabled: Boolean(authority),
    // List changes on claim/transfer — mutations patch; skip focus thrash.
    ...queryOptions.default,
  });
}
