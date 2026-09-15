"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import {
  claimAccessory,
  prepareClaimAccessory,
} from "@/lib/wallet/claim-accessory";

/**
 * Claim an unclaimed accessory for the signed-in owner via a paymaster-sponsored
 * `set_authority`. Slot-hash challenges are fetched on click (not prefetched) so
 * they stay fresh. Call `mutate` from a click handler.
 */
export function useClaimAccessory(phygitalToken: string) {
  const { address, isAuthenticated } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address) {
        throw new Error("Sign in to claim this item");
      }
      const prepared = await prepareClaimAccessory({
        phygitalToken,
        ownerAddress: address,
      });
      const sent = await claimAccessory({ prepared });
      await sent.confirmed;
      return { signature: sent.signature };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tokenAuthority.byToken(phygitalToken),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.walletPolicy.byToken(phygitalToken),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ownedAccessories.byOwner(address),
      });
    },
  });
}
