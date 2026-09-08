"use client";

import { useEffect } from "react";
import { QrCode } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { WalletAddressRow } from "@/components/shared/copyable-address";
import { WalletQrCode } from "@/components/wallet/wallet-qr";
import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { brand, copy } from "@/lib/copy/phygital";
import { receiveSplitClass } from "@/lib/layout";
import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchVerifiedTokens } from "@/lib/wallet/verified-tokens-client";

/** Receive hub — QR + Receive nearby; split on desktop. */
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
  const payUrl = `solana:${walletAddress.trim()}?label=${encodeURIComponent(brand.company)}`;

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.verifiedTokens.all(),
      queryFn: () => fetchVerifiedTokens(),
      ...queryOptions.stable,
    });
  }, [queryClient]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        align="start"
        leading={
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {copy.common.cancel}
          </Button>
        }
        title={copy.wallet.receive}
      />

      <div className={receiveSplitClass}>
        <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
          <div className="rounded-[28px] border border-border/40 bg-card p-5 shadow-[0_16px_48px_-24px_var(--card-shadow)] md:p-6">
            <WalletQrCode
              value={payUrl}
              size={224}
              className="size-48 md:size-56"
            />
          </div>
          <p className="text-sm font-medium">{copy.wallet.receiveAnything}</p>
          <div className="w-full">
            <WalletAddressRow address={walletAddress} length={6} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onReceiveNearby}
            className="h-auto min-h-0 w-full justify-start gap-3 rounded-3xl bg-muted/25 px-4 py-4 text-left font-normal hover:bg-muted/40 lg:min-h-[12rem] lg:flex-col lg:items-start lg:justify-between lg:border lg:border-border/40 lg:bg-card/70 lg:px-5 lg:py-5 lg:shadow-[0_12px_40px_-28px_var(--card-shadow)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background text-muted-foreground">
              <QrCode className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium lg:text-display-md lg:tracking-tight">
                {copy.wallet.receiveNearby}
              </p>
              <p className="text-xs text-muted-foreground lg:text-sm lg:leading-relaxed">
                {copy.wallet.receiveNearbyHint}
              </p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
