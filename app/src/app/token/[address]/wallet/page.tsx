"use client";

import { useCallback } from "react";
import { Copy, EllipsisVertical, Settings } from "lucide-react";
import { toast } from "sonner";

import { IdentityChip } from "@/components/shared/identity-chip";
import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletHomePanel } from "@/components/wallet/wallet-home-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { copy } from "@/lib/copy/phygital";
import { isClaimDismissed } from "@/lib/wallet/claim-setup-href";
import { shortAddress } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export default function WalletHomePage() {
  const {
    claimed,
    tokenAddress,
    walletAddress,
    mint,
    collectible,
    isOwner,
    linkedElsewhere,
    unclaimed,
    claimedQuiet,
  } = useWalletSession();
  const { go, goSettings, goSend, goCard, refresh, requestClaim } =
    useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  const feeBalance = useFeeBalance(isOwner ? tokenAddress : null);
  const rpc = useRpcPreference();

  const resolvedLabel =
    collectible?.name ?? (mint ? copy.home.card : copy.common.wallet);
  const status = portfolio.isError
    ? "error"
    : portfolio.isLoading
      ? "refreshing"
      : "live";

  const copyWalletAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.success(copy.address.copiedToClipboard);
    } catch {
      toast.error(copy.wallet.addressCopyFailed);
    }
  }, [walletAddress]);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar
        leading={
          <div className="flex min-w-0 items-start gap-0.5">
            <div className="flex min-w-0 flex-col gap-0 leading-tight">
              <p className="truncate text-sm font-medium tracking-tight">
                {resolvedLabel}
              </p>
              <p
                className="truncate py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums"
                title={walletAddress}
              >
                {shortAddress(walletAddress, 4)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.wallet.moreAria}
                  className="-mt-1 size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <EllipsisVertical className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44 w-auto">
                <DropdownMenuItem onSelect={() => void copyWalletAddress()}>
                  <Copy aria-hidden />
                  {copy.wallet.copyAddress}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => go("settings")}>
                  <Settings aria-hidden />
                  {copy.wallet.settings}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        trailing={
          mint ? <IdentityChip viewingWallet onToggle={goCard} /> : undefined
        }
      />
      <WalletHomePanel
        portfolio={portfolio.data}
        loading={portfolio.isLoading}
        linkedMint={mint}
        onSend={() => goSend()}
        onSendAsset={(asset) => goSend(asset)}
        onReceive={() => go("receive")}
        onSelectCollectible={(c) => {
          go("collectibles", c.mint);
        }}
        onSeeAllTokens={() => go("tokens")}
        onSeeAllCollectibles={() => go("collectibles")}
        onSeeAllActivity={() => go("activity")}
        onAddRecovery={isOwner ? () => goSettings("recoveryWallet") : undefined}
        suppressFirstRun={
          !isOwner &&
          unclaimed &&
          !linkedElsewhere &&
          !isClaimDismissed(tokenAddress)
        }
        visitorNotice={
          isOwner || linkedElsewhere
            ? null
            : unclaimed || claimed === undefined
              ? copy.wallet.claimBannerTitle
              : null
        }
        visitorNoticeAction={
          !isOwner &&
          !linkedElsewhere &&
          !claimedQuiet &&
          (unclaimed || claimed === undefined)
            ? copy.wallet.claimBannerAction
            : undefined
        }
        onVisitorNotice={
          !isOwner &&
          !linkedElsewhere &&
          !claimedQuiet &&
          (unclaimed || claimed === undefined)
            ? requestClaim
            : undefined
        }
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
      />
    </div>
  );
}
