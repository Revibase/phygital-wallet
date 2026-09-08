"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import {
  fetchOpenApprovals,
  type OpenApproval,
} from "@/lib/wallet/policies-client";

/** Open approvals for the owner device. Visitors pass null token. */
export function useOpenApprovals(phygitalToken: string | null) {
  const approvals = useQuery({
    queryKey: queryKeys.walletApprovals.byToken(phygitalToken),
    queryFn: (): Promise<OpenApproval[]> => fetchOpenApprovals(phygitalToken!),
    enabled: Boolean(phygitalToken),
    ...queryOptions.volatile,
  });

  return {
    approvals: approvals.data ?? [],
    isLoading: approvals.isLoading,
    refetch: approvals.refetch,
  };
}
