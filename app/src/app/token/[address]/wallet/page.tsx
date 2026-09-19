"use client";

import { useCallback } from "react";
import { Settings } from "lucide-react";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { WalletHomePanel } from "@/components/wallet/wallet-home-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { copy } from "@/lib/copy/phygital";
import { walletContentColumnClass } from "@/lib/layout";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";
import type { SendAssetRef } from "@/lib/wallet/send-asset-ref";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export default function WalletHomePage() {
  const { tokenAddress, walletAddress } = useWalletSession();
  const { go, goSettings, goSend, refresh } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  const feeBalance = useFeeBalance(tokenAddress);
  const rpc = useRpcPreference();
  const ownership = useTokenOwner(tokenAddress);

  const status =
    portfolio.isError
      ? "error"
      : portfolio.isFetching && portfolio.data
      ? "refreshing"
      : "live";

  const onSend = useCallback(() => goSend(), [goSend]);
  const onSendAsset = useCallback(
    (asset: SendAssetRef) => goSend(asset),
    [goSend],
  );
  const onReceive = useCallback(() => go("receive"), [go]);
  const onSelectCollectible = useCallback(
    (c: WalletCollectible) => go("collectibles", c.mint),
    [go],
  );
  const onSeeAllTokens = useCallback(() => go("tokens"), [go]);
  const onSeeAllCollectibles = useCallback(() => go("collectibles"), [go]);
  const onSeeAllActivity = useCallback(() => go("activity"), [go]);
  const onTopUpFees = useCallback(
    () => goSettings("feeBalance"),
    [goSettings],
  );
  const onChangeRpc = useCallback(
    () => goSettings("rpcConnection"),
    [goSettings],
  );
  const onOpenSettings = useCallback(() => go("settings"), [go]);

  const visitorNotice =
    ownership.isClaimed && ownership.isSignedIn && !ownership.isOwner
      ? copy.wallet.vistorNote
      : null;

  return (
    <div className={walletContentColumnClass}>
      <NavBar
        desktopHidden
        leading={
          <div className="flex min-w-0 flex-col gap-0 leading-tight">
            <p className="truncate text-sm font-medium tracking-tight">
              {copy.common.wallet}
            </p>
            <CopyableAddress
              address={walletAddress}
              length={4}
              label={copy.address.wallet}
              className="min-h-0 py-0.5 text-[11px] text-muted-foreground"
            />
          </div>
        }
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={copy.wallet.manageDevice}
            onClick={onOpenSettings}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        }
      />
      <WalletHomePanel
        portfolio={portfolio.data}
        loading={portfolio.isLoading}
        onSend={onSend}
        onSendAsset={onSendAsset}
        onReceive={onReceive}
        onSelectCollectible={onSelectCollectible}
        onSeeAllTokens={onSeeAllTokens}
        onSeeAllCollectibles={onSeeAllCollectibles}
        onSeeAllActivity={onSeeAllActivity}
        feeBalanceLow={feeBalance.data?.low}
        onTopUpFees={onTopUpFees}
        customRpcEndpoint={rpc.isCustom ? rpc.displayEndpoint : null}
        onChangeRpc={onChangeRpc}
        onRefresh={refresh}
        status={status}
        lastUpdatedLabel={
          portfolio.dataUpdatedAt
            ? copy.wallet.lastUpdated(
                timeFormatter.format(portfolio.dataUpdatedAt),
              )
            : null
        }
        visitorNotice={visitorNotice}
      />
    </div>
  );
}
