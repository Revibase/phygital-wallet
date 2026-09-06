"use client";

import { useEffect } from "react";
import { QrCode, Share2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { WalletAddressRow } from "@/components/shared/copyable-address";
import { WalletQrCode } from "@/components/wallet/wallet-qr";
import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { brand, copy } from "@/lib/copy/phygital";
import { queryKeys, queryOptions } from "@/lib/queries";
import { fetchVerifiedTokens } from "@/lib/wallet/verified-tokens-client";

/** Receive hub — QR + Receive nearby. */
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

  async function shareAddress() {
    const payload = {
      title: brand.company,
      text: walletAddress,
      url: payUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(walletAddress);
      }
      toast.success(copy.wallet.shareAddress);
    } catch (e) {
      // Ignore user-cancelled share (AbortError / NotAllowedError)
      if (e instanceof DOMException && (e.name === "AbortError" || e.name === "NotAllowedError")) return;
      console.warn("[receive-hub] Share failed", e);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {copy.common.cancel}
          </Button>
        }
        title={copy.wallet.receive}
      />

      <div className="flex flex-col items-center gap-3 px-2 text-center">
        <div className="rounded-[28px] border border-border/40 bg-card p-5 shadow-[0_16px_48px_-24px_var(--card-shadow)]">
          <WalletQrCode value={payUrl} size={192} className="size-48" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{copy.wallet.receiveAnything}</p>
          <p className="text-xs text-muted-foreground">{brand.company}</p>
        </div>
      </div>

      <WalletAddressRow address={walletAddress} length={6} />

      <div className="grid grid-cols-1 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void shareAddress()}
          className="h-auto min-h-11 w-full gap-2 rounded-2xl border-border/60 bg-muted/20 px-4 py-3 text-sm font-medium hover:bg-muted/30"
        >
          <Share2 className="size-4" aria-hidden />
          {copy.wallet.share}
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={onReceiveNearby}
        className="mt-auto h-auto min-h-0 w-full justify-start gap-3 rounded-3xl bg-muted/25 px-4 py-4 text-left font-normal hover:bg-muted/40"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background text-muted-foreground">
          <QrCode className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{copy.wallet.receiveNearby}</p>
          <p className="text-xs text-muted-foreground">
            {copy.wallet.receiveNearbyHint}
          </p>
        </div>
      </Button>
    </div>
  );
}
