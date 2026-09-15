"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copy } from "@/lib/copy/phygital";
import { walletSettingsHref } from "@/lib/wallet/token-routes";

/** Shown right after a successful claim — everyday payments are now on. */
export function ClaimedSuccessDialog({
  open,
  onOpenChange,
  phygitalTokenPda,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phygitalTokenPda: string;
}) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.wallet.policyClaimedTitle}</DialogTitle>
          <DialogDescription>{copy.wallet.policyClaimedBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            {copy.wallet.policyClaimedStay}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              router.push(walletSettingsHref(phygitalTokenPda, "walletPolicy"));
            }}
          >
            {copy.wallet.policyClaimedLimit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
