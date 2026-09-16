"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgramPermissionArgs } from "phygital-wallet-sdk";
import { toast } from "sonner";

import type { WalletPolicyView } from "@/hooks/token/use-wallet-policy";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import {
  applyOptimisticWalletPolicy,
  buildOptimisticWalletPolicyView,
  queryKeys,
  restoreWalletPolicySnapshot,
  watchTransactionConfirmation,
} from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  setWalletPolicy,
  type MintCapInput,
  type SolCapInput,
} from "@/lib/wallet/set-wallet-policy";

/**
 * Set the on-chain spend policy (owner-signed, paymaster-fee-paid). Resolves on
 * RPC accept; policy cache updates immediately and rolls back if confirmation
 * fails.
 */
export function useSetWalletPolicy(phygitalToken: string) {
  const { address, isAuthenticated, signer } = useOwnerWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      solCap?: SolCapInput | null;
      mintCaps?: MintCapInput[];
      programPermissions?: ProgramPermissionArgs[];
    }) => {
      if (!isAuthenticated || !address || !signer) {
        throw new Error("Sign in to update spending limits");
      }
      const sent = await setWalletPolicy({
        phygitalToken,
        owner: signer,
        solCap: input.solCap,
        mintCaps: input.mintCaps,
        programPermissions: input.programPermissions,
      });

      const previous = queryClient.getQueryData<WalletPolicyView>(
        queryKeys.walletPolicy.byToken(phygitalToken),
      );
      const policyBefore = applyOptimisticWalletPolicy(
        queryClient,
        phygitalToken,
        buildOptimisticWalletPolicyView(input, previous),
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
