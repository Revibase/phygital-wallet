"use client";

import { useState } from "react";
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
import { useUnlinkAccessory } from "@/hooks/token/use-unlink-accessory";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * Owner-only danger action: unlink (on-chain `clear_authority`). Rendered inside
 * the owner-gated settings, so it is only reachable by the current owner.
 */
export function OwnerDangerSection({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const [open, setOpen] = useState(false);
  const unlink = useUnlinkAccessory(phygitalTokenPda);

  function onConfirm() {
    unlink.mutate(undefined, {
      onSuccess: () => {
        toast.success("Accessory unlinked");
        setOpen(false);
      },
      onError: (err) =>
        toast.error(toUserErrorMessage(err, "Couldn’t unlink this item")),
    });
  }

  return (
    <>
      <GroupedList label="Danger zone">
        <GroupedRow
          destructive
          onClick={() => setOpen(true)}
          subtitle="Removes the owner and disables the accessory until it is claimed again."
        >
          Unlink accessory
        </GroupedRow>
      </GroupedList>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!unlink.isPending) setOpen(next);
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
              onClick={onConfirm}
            >
              {unlink.isPending ? "Unlinking…" : "Unlink"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
