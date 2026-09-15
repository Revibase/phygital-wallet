"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { queryKeys } from "@/lib/queries";
import {
  claimAccessory,
  prepareClaimAccessory,
  type PreparedClaim,
} from "@/lib/wallet/claim-accessory";

function claimPrepKey(phygitalToken: string, address: string) {
  return ["claim-accessory-prep", phygitalToken, address] as const;
}

/**
 * Claim an unclaimed accessory for the signed-in owner via a paymaster-sponsored
 * `set_authority`. Prefetches the challenge (no WebAuthn). Call `mutate` only from
 * a click — it must not await network before starting the accessory tap.
 */
export function useClaimAccessory(phygitalToken: string) {
  const { address, isAuthenticated } = useOwnerWallet();
  const queryClient = useQueryClient();
  const prepKey =
    address != null ? claimPrepKey(phygitalToken, address) : null;

  const prep = useQuery({
    queryKey: prepKey ?? claimPrepKey(phygitalToken, ""),
    enabled: Boolean(isAuthenticated && address && prepKey),
    queryFn: () =>
      prepareClaimAccessory({
        phygitalToken,
        ownerAddress: address!,
      }),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !address || !prepKey) {
        throw new Error("Sign in to claim this item");
      }
      // Synchronous cache read — never await prepare before WebAuthn.
      const prepared = queryClient.getQueryData<PreparedClaim>(prepKey);
      if (!prepared) {
        throw new Error("Claim isn’t ready yet — try again");
      }
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
      if (prepKey) {
        void queryClient.invalidateQueries({ queryKey: prepKey });
      }
    },
  });

  return {
    ...mutation,
    /** Challenge ready — Hold CTA may start WebAuthn on click. */
    holdReady: Boolean(prep.data) && !prep.isError,
    holdPreparing: prep.isPending || (prep.isFetching && !prep.data),
  };
}
