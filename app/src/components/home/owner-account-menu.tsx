"use client";

import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

/**
 * Owner account control on the dashboard: shows the signed-in address and,
 * in a bottom sheet, lets the owner export their private key or sign out.
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-lg rounded-t-3xl md:rounded-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{copy.home.account}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
