"use client";

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
  const owner = useOwnerWallet();
  const authorityQuery = useTokenAuthority(phygitalToken);
  const authority = authorityQuery.data?.authority ?? null;

  return {
    ownerAddress: owner.address,
    isSignedIn: owner.isAuthenticated,
    authority,
    isClaimed: authorityQuery.data?.isClaimed ?? false,
    isOwner:
      owner.isAuthenticated &&
      owner.address != null &&
      authority != null &&
      owner.address === authority,
    isLoading: owner.isLoading || authorityQuery.isPending,
  };
}
