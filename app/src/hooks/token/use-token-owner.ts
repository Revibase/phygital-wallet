"use client";

import { useMemo } from "react";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { useTokenAuthority } from "@/hooks/token/use-token-authority";

export type TokenOwnerState = {
  /** Signed-in WaaS wallet address, or null. */
  ownerAddress: string | null;
  isSignedIn: boolean;
  /** On-chain Authority for this token, or null when unclaimed. */
  authority: string | null;
  isClaimed: boolean;
  /** Signed in AND the signed-in wallet is this accessory's on-chain authority. */
  isOwner: boolean;
  isLoading: boolean;
};

/**
 * Client-side ownership check: is the signed-in owner wallet the on-chain
 * authority for this accessory? The basis for gating owner-only routes.
 */
export function useTokenOwner(phygitalToken: string | null): TokenOwnerState {
  const { address, isAuthenticated, isLoading } = useOwnerWallet();
  const authorityQuery = useTokenAuthority(phygitalToken);
  const authority = authorityQuery.data?.authority ?? null;
  const isClaimed = authorityQuery.data?.isClaimed ?? false;
  const isOwner =
    isAuthenticated &&
    address != null &&
    authority != null &&
    address === authority;
  const loading = isLoading || authorityQuery.isPending;

  return useMemo(
    () => ({
      ownerAddress: address,
      isSignedIn: isAuthenticated,
      authority,
      isClaimed,
      isOwner,
      isLoading: loading,
    }),
    [address, isAuthenticated, authority, isClaimed, isOwner, loading],
  );
}
