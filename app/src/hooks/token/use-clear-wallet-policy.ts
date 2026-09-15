"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import { clearWalletPolicy } from "@/lib/wallet/clear-wallet-policy";

/**
 * Turn off accessory policy protections (`clear_wallet_policy`) while keeping
 * the owner. Prefer restoring everyday payments via empty `set_wallet_policy`
 * unless the owner explicitly wants no checks.
 */
export function useClearWalletPolicy(phygitalToken: string) {
  const { address, isAuthenticated, signer } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address || !signer) {
        throw new Error("Sign in to update spending limits");
      }
      const sent = await clearWalletPolicy({
        phygitalToken,
        owner: signer,
      });
      await sent.confirmed;
      return { signature: sent.signature };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.walletPolicy.byToken(phygitalToken),
      });
    },
  });
}
