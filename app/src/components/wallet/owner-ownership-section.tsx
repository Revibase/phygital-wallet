"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useUnlinkAccessory } from "@/hooks/token/use-unlink-accessory";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { walletClaimHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";
import { shortAddress } from "@/lib/utils";

/**
 * Ownership controls on the settings hub. Claim / `set_authority` lives on
 * {@link walletClaimHref}; this section links there and handles unlink.
 *
 * Unlink has no second confirm — the secure-signer sheet is the authorization
 * step (and the only modal in the flow).
 */
export function OwnerOwnershipSection({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const router = useRouter();
  const { login } = useOwnerWallet();
  const { isSignedIn, isClaimed, isOwner, authority, isLoading } =
    useTokenOwner(phygitalTokenPda);
  const unlink = useUnlinkAccessory(phygitalTokenPda);
  const [signingIn, setSigningIn] = useState(false);

  function goClaim() {
    router.push(walletClaimHref(phygitalTokenPda));
  }

  async function signInHere() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await login();
    } catch (err) {
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
    } finally {
      setSigningIn(false);
    }
  }

  function runUnlink() {
    if (unlink.isPending) return;
    unlink.mutate(undefined, {
      onSuccess: () => {
        toast.success(copy.wallet.ownershipUnlinked);
      },
      onError: (err) =>
        toast.error(toUserErrorMessage(err, copy.wallet.ownershipUnlinkFailed)),
    });
  }

  if (isLoading) {
    return (
      <GroupedList label={copy.wallet.ownershipLabel}>
        <div className="px-4 py-3">
          <Skeleton className="h-5 w-40 rounded" />
        </div>
      </GroupedList>
    );
  }

  if (!isSignedIn) {
    return (
      <GroupedList label={copy.wallet.ownershipLabel}>
        <GroupedRow
          onClick={() => {
            if (!isClaimed) {
              goClaim();
              return;
            }
            void signInHere();
          }}
          subtitle={
            signingIn
              ? copy.common.loading
              : copy.wallet.ownershipSignInSubtitle
          }
        >
          {copy.wallet.ownershipSignIn}
        </GroupedRow>
      </GroupedList>
    );
  }

  if (!isClaimed) {
    return (
      <GroupedList
        label={copy.wallet.ownershipLabel}
        footer={copy.wallet.ownershipClaimFooter}
      >
        <div className="px-4 py-3">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            onClick={goClaim}
          >
            {copy.wallet.authorityClaimCta}
          </Button>
        </div>
      </GroupedList>
    );
  }

  if (!isOwner) {
    return (
      <GroupedList
        label={copy.wallet.ownershipLabel}
        footer={copy.wallet.ownershipOtherFooter}
      >
        <GroupedRow
          subtitle={
            authority
              ? copy.wallet.ownershipOtherSubtitle(shortAddress(authority))
              : undefined
          }
        >
          {copy.wallet.ownershipOtherTitle}
        </GroupedRow>
      </GroupedList>
    );
  }

  return (
    <GroupedList label={copy.wallet.ownershipDangerZone}>
      <GroupedRow
        destructive
        onClick={runUnlink}
        subtitle={
          unlink.isPending
            ? copy.wallet.ownershipUnlinking
            : copy.wallet.ownershipUnlinkSubtitle
        }
      >
        {copy.wallet.ownershipUnlink}
      </GroupedRow>
    </GroupedList>
  );
}
