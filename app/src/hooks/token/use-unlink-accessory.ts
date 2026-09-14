"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import { unlinkAccessory } from "@/lib/wallet/unlink-accessory";

/**
 * Unlink the accessory (on-chain `clear_authority`) — paymaster-sponsored, the
 * signed-in owner co-signs as authority. Resolves once confirmed so the
 * ownership gate flips back to unclaimed.
 */
export function useUnlinkAccessory(phygitalToken: string) {
  const { address, isAuthenticated, signTransaction } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address) {
        throw new Error("Sign in to unlink this item");
      }
      const sent = await unlinkAccessory({
        phygitalToken,
        owner: { address, signTransaction },
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
