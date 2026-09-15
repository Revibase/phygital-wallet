"use client";

import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

/**
 * Owner account control on the dashboard: shows the signed-in address and,
 * in a sheet, lets the owner export their private key or sign out.
 */
export function OwnerAccountMenu({ className }: { className?: string }) {
  const { address, logout, exportWallet } = useOwnerWallet();
  const [open, setOpen] = useState(false);

  async function onExport() {
    try {
      await exportWallet();
    } catch (err) {
      toast.error(
        toUserErrorMessage(err, copy.home.accountExportFailed),
      );
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("rounded-full", className)}
        onClick={() => setOpen(true)}
      >
        {address ? shortAddress(address) : copy.home.account}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.home.account}</DialogTitle>
          </DialogHeader>
          <GroupedList>
            <GroupedRow
              leading={<KeyRound className="size-4" />}
              subtitle={copy.home.accountExportKeySubtitle}
              onClick={() => {
                setOpen(false);
                void onExport();
              }}
            >
              {copy.home.accountExportKey}
            </GroupedRow>
            <GroupedRow
              destructive
              leading={<LogOut className="size-4" />}
              onClick={() => {
                setOpen(false);
                void logout();
              }}
            >
              {copy.home.accountSignOut}
            </GroupedRow>
          </GroupedList>
        </DialogContent>
      </Dialog>
    </>
  );
}
