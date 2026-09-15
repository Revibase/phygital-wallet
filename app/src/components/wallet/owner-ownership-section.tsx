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
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useUnlinkAccessory } from "@/hooks/token/use-unlink-accessory";
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

  function goSignIn() {
    setPendingReturn(walletSettingsHref(phygitalTokenPda));
    router.push("/");
  }

  if (isLoading) {
    return (
      <GroupedList label="Ownership">
        <div className="px-4 py-3">
          <Skeleton className="h-5 w-40 rounded" />
        </div>
      </GroupedList>
    );
  }

  if (!isSignedIn) {
    return (
      <GroupedList label="Ownership">
        <GroupedRow
          onClick={goSignIn}
          subtitle="Sign in to claim or manage this accessory."
        >
          Sign in
        </GroupedRow>
      </GroupedList>
    );
  }

  if (!isClaimed) {
    return (
      <GroupedList
        label="Ownership"
        footer="Claiming sets your wallet as the owner. You’ll tap the accessory to confirm."
      >
        <div className="px-4 py-3">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={claim.isPending}
            onClick={() =>
              claim.mutate(undefined, {
                onSuccess: () => toast.success("Accessory claimed"),
                onError: (err) =>
                  toast.error(toUserErrorMessage(err, "Couldn’t claim this item")),
              })
            }
          >
            {claim.isPending ? "Claiming…" : "Claim this accessory"}
          </Button>
        </div>
      </GroupedList>
    );
  }

  if (!isOwner) {
    return (
      <GroupedList label="Ownership">
        <GroupedRow subtitle={authority ? shortAddress(authority) : undefined}>
          Owned by another wallet
        </GroupedRow>
      </GroupedList>
    );
  }

  return (
    <>
      <GroupedList label="Danger zone">
        <GroupedRow
          destructive
          onClick={() => setConfirmOpen(true)}
          subtitle="Removes the owner and disables the accessory until it is claimed again."
        >
          Unlink accessory
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
            <DialogTitle>Unlink this accessory?</DialogTitle>
            <DialogDescription>
              This removes you as the owner and disables the accessory. Anyone
              holding it can claim it again with a tap.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={unlink.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={unlink.isPending}
              onClick={() =>
                unlink.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Accessory unlinked");
                    setConfirmOpen(false);
                  },
                  onError: (err) =>
                    toast.error(
                      toUserErrorMessage(err, "Couldn’t unlink this item")
                    ),
                })
              }
            >
              {unlink.isPending ? "Unlinking…" : "Unlink"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
