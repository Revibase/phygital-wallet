"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  applyOptimisticOwnedAccessories,
  applyOptimisticTokenAuthority,
  applyOptimisticWalletPolicy,
  restoreOwnedAccessoriesSnapshot,
  restoreTokenAuthoritySnapshot,
  restoreWalletPolicySnapshot,
  STANDARD_POLICY_VIEW,
  watchTransactionConfirmation,
} from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  claimAccessory,
  prepareClaimAccessory,
} from "@/lib/wallet/claim-accessory";

/**
 * Claim an unclaimed accessory for the signed-in owner via a paymaster-sponsored
 * `set_authority`. Slot-hash challenges are fetched on click (not prefetched) so
 * they stay fresh. Resolves on RPC accept; patches ownership caches immediately
 * and rolls back if confirmation fails.
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

      const authorityBefore = applyOptimisticTokenAuthority(
        queryClient,
        phygitalToken,
        { isClaimed: true, authority: address },
      );
      const policyBefore = applyOptimisticWalletPolicy(
        queryClient,
        phygitalToken,
        STANDARD_POLICY_VIEW,
      );
      const ownedBefore = applyOptimisticOwnedAccessories(
        queryClient,
        address,
        phygitalToken,
        "add",
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
