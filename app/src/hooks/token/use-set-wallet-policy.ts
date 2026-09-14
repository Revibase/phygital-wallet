"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import {
  setWalletPolicy,
  type MintCapInput,
  type SolCapInput,
} from "@/lib/wallet/set-wallet-policy";

/**
 * Set the on-chain spend policy (owner-signed, paymaster-fee-paid). Resolves
 * once confirmed so the policy view refetches.
 */
export function useSetWalletPolicy(phygitalToken: string) {
  const { address, isAuthenticated, signTransaction } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      solCap?: SolCapInput | null;
      mintCaps?: MintCapInput[];
    }) => {
      if (!isAuthenticated || !address) {
        throw new Error("Sign in to update spending limits");
      }
      const sent = await setWalletPolicy({
        phygitalToken,
        owner: { address, signTransaction },
        solCap: input.solCap,
        mintCaps: input.mintCaps,
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
