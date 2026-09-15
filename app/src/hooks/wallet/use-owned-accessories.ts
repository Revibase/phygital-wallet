"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchOwnedAccessories } from "@/lib/wallet/owned-accessories-client";

/**
 * Every phygital token the signed-in owner is the on-chain authority of.
 * Client-side `getProgramAccounts` — needs no session, only the owner address.
 */
export function useOwnedAccessories(owner: string | null) {
  return useQuery({
    queryKey: queryKeys.ownedAccessories.byOwner(owner),
    queryFn: () => fetchOwnedAccessories(owner!),
    enabled: Boolean(owner),
    ...queryOptions.volatile,
  });
}
