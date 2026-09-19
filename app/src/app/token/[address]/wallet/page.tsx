"use client";

import { Settings } from "lucide-react";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { WalletHomePanel } from "@/components/wallet/wallet-home-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { copy } from "@/lib/copy/phygital";
import { walletContentColumnClass } from "@/lib/layout";

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

  const status = portfolio.isError
    ? "error"
    : portfolio.isLoading
    ? "refreshing"
    : "live";

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
            onClick={() => go("settings")}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        }
      />
      <WalletHomePanel
        portfolio={portfolio.data}
        loading={portfolio.isLoading}
        onSend={() => goSend()}
        onSendAsset={(asset) => goSend(asset)}
        onReceive={() => go("receive")}
        onSelectCollectible={(c) => {
          go("collectibles", c.mint);
        }}
        onSeeAllTokens={() => go("tokens")}
        onSeeAllCollectibles={() => go("collectibles")}
        onSeeAllActivity={() => go("activity")}
        feeBalanceLow={feeBalance.data?.low}
        onTopUpFees={() => goSettings("feeBalance")}
        customRpcEndpoint={rpc.isCustom ? rpc.displayEndpoint : null}
        onChangeRpc={() => goSettings("rpcConnection")}
        onRefresh={refresh}
        status={status}
        lastUpdatedLabel={
          portfolio.dataUpdatedAt
            ? copy.wallet.lastUpdated(
                timeFormatter.format(portfolio.dataUpdatedAt),
              )
            : null
        }
        visitorNotice={copy?.wallet.vistorNote ?? null}
      />
    </div>
  );
}
