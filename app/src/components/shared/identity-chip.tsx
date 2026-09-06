"use client";

import { ModeSegment } from "@/components/shared/mode-segment";
import { copy } from "@/lib/copy/phygital";
import { cn } from "@/lib/utils";

/** Toggle between Object stage and Wallet — segmented control. */
export function IdentityChip({
  viewingWallet,
  onToggle,
  className,
}: {
  viewingWallet?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <ModeSegment
      mode={viewingWallet ? "wallet" : "object"}
      onChange={(mode) => {
        const wantWallet = mode === "wallet";
        if (wantWallet !== Boolean(viewingWallet)) onToggle();
      }}
      className={cn(className)}
      aria-label={
        viewingWallet
          ? copy.wallet.showCardAria
          : copy.wallet.openWalletAriaLabel
      }
    />
  );
}
