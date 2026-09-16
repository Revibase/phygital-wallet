"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  applyOptimisticWalletPolicy,
  OPEN_POLICY_VIEW,
  restoreWalletPolicySnapshot,
  watchTransactionConfirmation,
} from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { clearWalletPolicy } from "@/lib/wallet/clear-wallet-policy";

/**
 * Turn off accessory policy protections (`clear_wallet_policy`) while keeping
 * the owner. Prefer restoring everyday payments via empty `set_wallet_policy`
 * unless the owner explicitly wants no checks. Resolves on RPC accept; policy
 * cache flips to open immediately and rolls back if confirmation fails.
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

      const policyBefore = applyOptimisticWalletPolicy(
        queryClient,
        phygitalToken,
        OPEN_POLICY_VIEW,
      );

      watchTransactionConfirmation({
        confirmed: sent.confirmed,
        rollback: () =>
          restoreWalletPolicySnapshot(queryClient, phygitalToken, policyBefore),
        onConfirmError: (err) => toast.error(toUserErrorMessage(err)),
      });

      return { signature: sent.signature };
    },
  });
}
