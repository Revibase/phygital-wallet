"use client";

import { memo } from "react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GroupedRow } from "@/components/shared/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { copy } from "@/lib/copy/phygital";
import { cn, shortAddress } from "@/lib/utils";

/** Compact accessory row — wallet address only, no mint art. */
export const OwnerAccessoryCard = memo(function OwnerAccessoryCard({
  phygitalToken,
  busy = false,
  onOpen,
}: {
  phygitalToken: string;
  busy?: boolean;
  onOpen: (phygitalToken: string) => void;
}) {
  const { walletAddress, pending } = useWalletPda(phygitalToken);
  const subtitle = walletAddress
    ? shortAddress(walletAddress)
    : pending
    ? copy.home.loadingWallet
    : copy.home.walletUnknown;

  return (
    <GroupedRow
      onClick={busy ? undefined : () => onOpen(phygitalToken)}
      className={cn(busy && "opacity-70")}
      leading={
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/80">
          <RevibaseMark variant="digital" className="size-4 opacity-90" />
        </span>
      }
      trailing={
        busy ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : undefined
      }
      subtitle={
        pending && !walletAddress ? (
          <Skeleton className="mt-0.5 h-3 w-24" />
        ) : (
          <span className="font-mono text-[11px] tracking-tight">{subtitle}</span>
        )
      }
    >
      {copy.home.accessory}
    </GroupedRow>
  );
});
