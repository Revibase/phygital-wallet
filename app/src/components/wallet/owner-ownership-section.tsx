"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  function goClaim() {
    router.push(walletClaimHref(phygitalTokenPda));
  }

  async function onSignIn() {
    setSigningIn(true);
    try {
      await login();
    } catch (err) {
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
    } finally {
      setSigningIn(false);
    }
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
            if (signingIn) return;
            if (!isClaimed) {
              goClaim();
              return;
            }
            void onSignIn();
          }}
          subtitle={copy.wallet.ownershipSignInSubtitle}
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
    <>
      <GroupedList label={copy.wallet.ownershipDangerZone}>
        <GroupedRow
          destructive
          onClick={() => setConfirmOpen(true)}
          subtitle={copy.wallet.ownershipUnlinkSubtitle}
        >
          {copy.wallet.ownershipUnlink}
        </GroupedRow>
      </GroupedList>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!unlink.isPending) setConfirmOpen(next);
        }}
      >
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.wallet.ownershipUnlinkTitle}</DialogTitle>
            <DialogDescription>
              {copy.wallet.ownershipUnlinkBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={unlink.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={unlink.isPending}
              onClick={() =>
                unlink.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(copy.wallet.ownershipUnlinked);
                    setConfirmOpen(false);
                  },
                  onError: (err) =>
                    toast.error(
                      toUserErrorMessage(
                        err,
                        copy.wallet.ownershipUnlinkFailed,
                      ),
                    ),
                })
              }
            >
              {unlink.isPending
                ? copy.wallet.ownershipUnlinking
                : copy.wallet.ownershipUnlinkCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
