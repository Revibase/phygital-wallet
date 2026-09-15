"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
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
import { ClaimedSuccessDialog } from "@/components/wallet/claimed-success-dialog";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useUnlinkAccessory } from "@/hooks/token/use-unlink-accessory";
import { copy } from "@/lib/copy/phygital";
import { setPendingReturn } from "@/lib/wallet/claim-return";
import { walletSettingsHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";
import { shortAddress } from "@/lib/utils";

/**
 * Ownership controls in settings. Self-guards via the frontend ownership check
 * (`useTokenOwner`): signed out → send to home to sign in and return; signed in
 * and unclaimed → claim; owner → unlink (danger); signed in but not the owner →
 * show who owns it. Settings itself is no longer owner-gated — only the policy
 * route is — so this block manages the whole ownership lifecycle inline.
 */
export function OwnerOwnershipSection({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const router = useRouter();
  const { isSignedIn, isClaimed, isOwner, authority, isLoading } =
    useTokenOwner(phygitalTokenPda);
  const claim = useClaimAccessory(phygitalTokenPda);
  const unlink = useUnlinkAccessory(phygitalTokenPda);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [claimedOpen, setClaimedOpen] = useState(false);

  function goSignIn() {
    setPendingReturn(walletSettingsHref(phygitalTokenPda));
    router.push("/");
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
          onClick={goSignIn}
          subtitle={copy.wallet.ownershipSignInSubtitle}
        >
          {copy.wallet.ownershipSignIn}
        </GroupedRow>
      </GroupedList>
    );
  }

  if (!isClaimed) {
    return (
      <>
        <GroupedList
          label={copy.wallet.ownershipLabel}
          footer={copy.wallet.ownershipClaimFooter}
        >
          <div className="px-4 py-3">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={claim.isPending}
              onClick={() =>
                claim.mutate(undefined, {
                  onSuccess: () => setClaimedOpen(true),
                  onError: (err) =>
                    toast.error(
                      toUserErrorMessage(err, copy.wallet.authorityClaimFailed),
                    ),
                })
              }
            >
              {claim.isPending
                ? copy.wallet.holdCeremonyTitle
                : copy.wallet.authorityClaimCta}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {copy.wallet.holdCeremonyBody}
            </p>
          </div>
        </GroupedList>
        {claim.isPending ? (
          <div className="fixed inset-0 z-50 bg-background">
            <CeremonyShell>
              <NfcHoldStatus
                size="lg"
                pulsing
                busy
                progress
                title={copy.wallet.holdCeremonyTitle}
                body={copy.wallet.holdCeremonyBody}
              />
            </CeremonyShell>
          </div>
        ) : null}
        <ClaimedSuccessDialog
          open={claimedOpen}
          onOpenChange={setClaimedOpen}
          phygitalTokenPda={phygitalTokenPda}
        />
      </>
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
        <DialogContent>
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
