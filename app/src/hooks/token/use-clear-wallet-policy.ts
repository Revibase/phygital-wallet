"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import { clearWalletPolicy } from "@/lib/wallet/clear-wallet-policy";

/**
 * Clear the on-chain spend policy — drops all caps, keeps the owner.
 * Owner-signed, paymaster-fee-paid.
 */
export function useClearWalletPolicy(phygitalToken: string) {
  const { address, isAuthenticated, signTransaction } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address) {
        throw new Error("Sign in to update spending limits");
      }
      const sent = await clearWalletPolicy({
        phygitalToken,
        owner: { address, signTransaction },
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
