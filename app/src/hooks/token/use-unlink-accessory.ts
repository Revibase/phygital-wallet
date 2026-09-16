"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  applyOptimisticOwnedAccessories,
  applyOptimisticTokenAuthority,
  applyOptimisticWalletPolicy,
  NONE_POLICY_VIEW,
  restoreOwnedAccessoriesSnapshot,
  restoreTokenAuthoritySnapshot,
  restoreWalletPolicySnapshot,
  watchTransactionConfirmation,
} from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { unlinkAccessory } from "@/lib/wallet/unlink-accessory";

/**
 * Unlink the accessory (on-chain `clear_authority`) — paymaster-sponsored, the
 * signed-in owner co-signs as authority. Resolves on RPC accept; ownership
 * caches flip to unclaimed immediately and roll back if confirmation fails.
 */
export function useUnlinkAccessory(phygitalToken: string) {
  const { address, isAuthenticated, signer } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address || !signer) {
        throw new Error("Sign in to unlink this item");
      }
      const sent = await unlinkAccessory({
        phygitalToken,
        owner: signer,
      });

      const authorityBefore = applyOptimisticTokenAuthority(
        queryClient,
        phygitalToken,
        { isClaimed: false, authority: null },
      );
      const policyBefore = applyOptimisticWalletPolicy(
        queryClient,
        phygitalToken,
        NONE_POLICY_VIEW,
      );
      const ownedBefore = applyOptimisticOwnedAccessories(
        queryClient,
        address,
        phygitalToken,
        "remove",
      );

      watchTransactionConfirmation({
        confirmed: sent.confirmed,
        rollback: () => {
          restoreTokenAuthoritySnapshot(
            queryClient,
            phygitalToken,
            authorityBefore,
          );
          restoreWalletPolicySnapshot(queryClient, phygitalToken, policyBefore);
          restoreOwnedAccessoriesSnapshot(queryClient, address, ownedBefore);
        },
        onConfirmError: (err) => toast.error(toUserErrorMessage(err)),
      });

      return { signature: sent.signature };
    },
  });
}
