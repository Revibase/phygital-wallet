"use client";

import { useEffect } from "react";
import { Nfc } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { WalletAddressRow } from "@/components/shared/copyable-address";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { WalletQrCode } from "@/components/wallet/wallet-qr";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { brand, copy } from "@/lib/copy/phygital";
import { walletContentColumnClass, walletDesktopTitleClass } from "@/lib/layout";
import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchVerifiedTokens } from "@/lib/wallet/verified-tokens-client";

/** Receive hub — QR primary; nearby as a compact secondary action. */
export function ReceiveHub({
  walletAddress,
  onClose,
  onReceiveNearby,
}: {
  walletAddress: string;
  onClose: () => void;
  onReceiveNearby: () => void;
}) {
  const queryClient = useQueryClient();
  const payUrl = `solana:${walletAddress.trim()}?label=${encodeURIComponent(
    brand.company,
  )}`;

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.verifiedTokens.all(),
      queryFn: () => fetchVerifiedTokens(),
      ...queryOptions.stable,
    });
  }, [queryClient]);

  return (
    <div className={walletContentColumnClass}>
      <NavBar
        desktopHidden
        align="start"
        leading={<NavBarBack onClick={onClose} />}
        title={copy.wallet.receive}
      />
      <h1 className={walletDesktopTitleClass}>{copy.wallet.receive}</h1>

      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <div className="rounded-[28px] border border-border/40 bg-card p-5 shadow-[0_16px_48px_-24px_var(--card-shadow)] md:p-6">
          <WalletQrCode
            value={payUrl}
            size={224}
            className="size-48 md:size-56"
          />
        </div>
        <p className="text-sm font-medium">{copy.wallet.receiveAnything}</p>
        <div className="w-full text-left">
          <WalletAddressRow address={walletAddress} length={6} />
        </div>
      </div>

      <GroupedList>
        <GroupedRow
          onClick={onReceiveNearby}
          leading={
            <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Nfc className="size-4" aria-hidden />
            </span>
          }
          subtitle={copy.wallet.receiveNearbyHint}
        >
          {copy.wallet.receiveNearby}
        </GroupedRow>
      </GroupedList>
    </div>
  );
}
