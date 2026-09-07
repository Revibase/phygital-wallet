"use client";

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
  const { go, goSettings, goSend, refresh, requestClaim } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  const feeBalance = useFeeBalance(isOwner ? tokenAddress : null);
  const rpc = useRpcPreference();

  const resolvedLabel =
    collectible?.name ?? (mint ? copy.home.card : copy.common.wallet);

  return (
    <div className="flex flex-1 flex-col">
      <WalletHomePanel
        portfolio={portfolio.data}
        loading={portfolio.isLoading}
        walletAddress={walletAddress}
        walletTitle={resolvedLabel}
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
        onManageDevice={() => go("settings")}
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
        status={
          portfolio.isError
            ? "error"
            : portfolio.isLoading
            ? "refreshing"
            : "live"
        }
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
