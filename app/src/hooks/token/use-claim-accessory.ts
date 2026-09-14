"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import { claimAccessory } from "@/lib/wallet/claim-accessory";

/**
 * Claim an unclaimed accessory for the signed-in owner via a paymaster-sponsored
 * `set_authority`. Requires an authenticated WaaS wallet (its address becomes
 * the authority); prompts an accessory tap. Resolves once the tx confirms so the
 * ownership gate re-reads the new authority.
 */
export function useClaimAccessory(phygitalToken: string) {
  const { address, isAuthenticated } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address) {
        throw new Error("Sign in to claim this item");
      }
      const sent = await claimAccessory({
        phygitalToken,
        ownerAddress: address,
      });
      await sent.confirmed;
      return { signature: sent.signature };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tokenAuthority.byToken(phygitalToken),
      });
    },
  });
}
