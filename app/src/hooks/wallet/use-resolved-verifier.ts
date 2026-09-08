"use client";

import { useQuery } from "@tanstack/react-query";
import { address } from "@solana/kit";
import {
  fetchVerifierAccountSnapshot,
  type VerifierAccountSnapshot,
} from "phygital-wallet-sdk";

import { queryKeys, queryOptions } from "@/lib/queries";
import { getSolanaRpc } from "@/lib/solana/rpc";

/** Prefetch TokenVerifier + Config for send (same RPC as resolveVerifier). */
export function useResolvedVerifier(phygitalToken: string | null) {
  return useQuery({
    queryKey: queryKeys.resolvedVerifier.byToken(phygitalToken),
    queryFn: (): Promise<VerifierAccountSnapshot> =>
      fetchVerifierAccountSnapshot(getSolanaRpc(), address(phygitalToken!)),
    enabled: Boolean(phygitalToken),
    ...queryOptions.default,
  });
}
