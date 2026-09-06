"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { StageTransition } from "@/components/shared/stage-transition";
import { WalletHomePanel } from "@/components/wallet/wallet-home-panel";
import { SendDialog } from "@/components/wallet/send-dialog";
import { SendHoldStage, type SendHoldRecap } from "@/components/wallet/send-hold-stage";
import { ActivityAllSheet } from "@/components/wallet/activity-all-sheet";
import { CollectibleDetailSheet } from "@/components/wallet/collectible-detail-sheet";
import { ReceiveHub } from "@/components/wallet/receive-hub";
import { ReceiveNearbySheet } from "@/components/wallet/receive-nearby-sheet";
import { OpenApprovalsSheet } from "@/components/wallet/open-approvals-sheet";
import { SettingsHub, type SettingsTarget } from "@/components/wallet/settings-hub";
import { LimitsSetupSheet } from "@/components/wallet/limits-setup-sheet";
import { SpendingLimitsSheet } from "@/components/wallet/spending-limits-sheet";
import { RecipientsSheet } from "@/components/wallet/recipients-sheet";
import { ExtraProgramsSheet } from "@/components/wallet/extra-programs-sheet";
import { SigningSettingsSheet } from "@/components/wallet/signing-settings-sheet";
import { RecoveryWalletSheet } from "@/components/wallet/recovery-wallet-sheet";
import { FeeBalanceSheet } from "@/components/wallet/fee-balance-sheet";
import { AccessRecoverySheet } from "@/components/wallet/access-recovery-sheet";
import { ClaimItemSheet } from "@/components/wallet/claim-item-sheet";
import { ContactsSheet } from "@/components/wallet/contacts-sheet";
import { RpcConnectionSheet } from "@/components/wallet/rpc-connection-sheet";
import { TokensAllSheet } from "@/components/wallet/tokens-all-sheet";
import { CollectiblesAllSheet } from "@/components/wallet/collectibles-all-sheet";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { useWalletActivity } from "@/hooks/wallet/use-wallet-activity";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useOpenApprovals } from "@/hooks/wallet/use-open-approvals";
import { tokenHasLinkedMint, type PhygitalToken } from "@/lib/phygital/token";
import { copy } from "@/lib/copy/phygital";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { shellLayoutClass } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { invalidateWalletBalances } from "@/lib/queries";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import type { WalletRole } from "@/components/token/token-address-route";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";
import {
  collectibleToSendAsset,
  type SendAssetRef,
} from "@/lib/wallet/send-asset-ref";
import {
  isPolicySetupScreen,
} from "@/lib/wallet/limits-setup-href";
import { isClaimDismissed } from "@/lib/wallet/claim-setup-href";

type Screen =
  | "home"
  | "send"
  | "receive"
  | "nearby"
  | "collectible"
  | "tokensAll"
  | "collectiblesAll"
  | "activity"
  | "settings"
  | SettingsTarget;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function settingsFromDenyCode(code?: string): Screen {
  if (code === "recipient_not_allowed") return "recipients";
  if (code === "spend_limit") return "spendingLimits";
  if (code === "program_not_allowed" || code === "instruction_not_allowed") {
    return "extraPrograms";
  }
  if (code === "insufficient_fee_balance") return "feeBalance";
  return "settings";
}

/**
 * Shared wallet workspace for accessory landing and card → Wallet mode.
 * Primary flows are full-screen stages; nested pickers stay bottom sheets.
 */
export function WalletWorkspace({
  token,
  role = "visitor",
  linkStatus,
  claimed,
  onBackToCard,
  cardLabel,
}: {
  token: PhygitalToken;
  role?: WalletRole;
  linkStatus?: LinkStatus;
  /** Public claimed flag; undefined while unknown (fail open). */
  claimed?: boolean;
  /** Return to mint metadata (card chip toggle / collectible “Open card”). */
  onBackToCard?: () => void;
  cardLabel?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full flex-1 flex-col", shellLayoutClass.compact)}>
      <WalletWorkspaceInner
        token={token}
        role={role}
        linkStatus={linkStatus}
        claimed={claimed}
        onBackToCard={onBackToCard}
        cardLabel={cardLabel}
      />
    </div>
  );
}

function WalletWorkspaceInner({
  token,
  role,
  linkStatus,
  claimed,
  onBackToCard,
  cardLabel,
}: {
  token: PhygitalToken;
  role: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
  onBackToCard?: () => void;
  cardLabel?: string;
}) {
  const tokenAddress = String(token.address);
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  // Parent (minted home) already resolved collectible via minted-view cache.
  const { collectible } = useResolvedDasCollectible(mint, {
    enabled: cardLabel == null,
  });
  const resolvedLabel =
    collectible?.name ??
    cardLabel ??
    (mint ? copy.home.card : copy.common.wallet);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialScreen = searchParams.get("screen");
  const [screen, setScreen] = useState<Screen>(() =>
    isPolicySetupScreen(initialScreen) ||
    initialScreen === "settings" ||
    initialScreen === "feeBalance" ||
    initialScreen === "access" ||
    initialScreen === "contacts" ||
    initialScreen === "signing" ||
    initialScreen === "recoveryWallet" ||
    initialScreen === "rpcConnection"
      ? (initialScreen as Screen)
      : "home",
  );
  const [recoveryReturn, setRecoveryReturn] = useState<Screen>("settings");
  const [sendAsset, setSendAsset] = useState<SendAssetRef | null>(null);
  const [sendTokensOnly, setSendTokensOnly] = useState(true);
  const [sendHoldPhase, setSendHoldPhase] = useState<"holding" | "success" | null>(
    null,
  );
  const [sendRecap, setSendRecap] = useState<SendHoldRecap | null>(null);
  const [detail, setDetail] = useState<WalletCollectible | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!searchParams.get("screen")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("screen");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const onSettings = useCallback(() => setScreen("settings"), []);

  const openRecovery = useCallback((from: Screen) => {
    setRecoveryReturn(from);
    setScreen("recoveryWallet");
  }, []);

  const { walletAddress } = useWalletPda(tokenAddress);

  // Defer secondary fetches so portfolio paints first on unminted unlock.
  const [deferSecondary, setDeferSecondary] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setDeferSecondary(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const portfolio = useWalletPortfolio(walletAddress);
  const activity = useWalletActivity(
    deferSecondary ? walletAddress : null,
    20,
  );
  const feeBalance = useFeeBalance(tokenAddress);
  const isOwner = role === "owner";
  const openApprovals = useOpenApprovals(
    isOwner && deferSecondary ? tokenAddress : null,
  );
  const [dismissApprovals, setDismissApprovals] = useState(false);
  const [claimSessionDismissed, setClaimSessionDismissed] = useState(() =>
    isClaimDismissed(tokenAddress),
  );
  const [forceClaim, setForceClaim] = useState(false);
  const [claimReturnScreen, setClaimReturnScreen] = useState<Screen>("home");
  const rpc = useRpcPreference();

  useEffect(() => {
    if (openApprovals.approvals.length > 0) setDismissApprovals(false);
  }, [openApprovals.approvals.length]);

  useEffect(() => {
    setClaimSessionDismissed(isClaimDismissed(tokenAddress));
    setForceClaim(false);
    setClaimReturnScreen("home");
  }, [tokenAddress]);

  const linkedElsewhere = linkStatus === "linked_elsewhere";
  const unclaimed = claimed === false;
  /** Claimed on platform but this phone isn’t owner — no claim sheet. */
  const claimedQuiet = claimed === true && !isOwner && !linkedElsewhere;
  const needsClaim =
    !isOwner &&
    unclaimed &&
    !linkedElsewhere &&
    !claimSessionDismissed;
  const showClaimSheet =
    needsClaim || (forceClaim && !isOwner && !linkedElsewhere && !claimedQuiet);

  const requestClaim = useCallback(() => {
    setClaimReturnScreen(screen);
    setForceClaim(true);
    setScreen("home");
  }, [screen]);

  const refresh = useCallback(() => {
    invalidateWalletBalances(queryClient, {
      wallets: [walletAddress],
      tokens: [tokenAddress],
    });
  }, [queryClient, walletAddress, tokenAddress]);

  const openSend = useCallback(
    (asset: SendAssetRef | null, tokensOnly: boolean) => {
      setSendAsset(asset);
      setSendTokensOnly(tokensOnly);
      setSendHoldPhase(null);
      setSendRecap(null);
      setDetail(null);
      setScreen("send");
    },
    [],
  );

  const closeSend = useCallback(() => {
    setSendHoldPhase(null);
    setSendRecap(null);
    setSendAsset(null);
    setScreen("home");
  }, []);

  if (!walletAddress) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {copy.common.loading}
      </p>
    );
  }

  const showOpenApprovals =
    isOwner &&
    !dismissApprovals &&
    openApprovals.approvals.length > 0 &&
    screen === "home";

  let body: ReactNode;

  if (showClaimSheet) {
    body = (
      <ClaimItemSheet
        phygitalTokenPda={tokenAddress}
        onClaimed={() => {
          setForceClaim(false);
          setClaimSessionDismissed(true);
          setClaimReturnScreen("home");
          setScreen("home");
        }}
        onDismiss={() => {
          const back = claimReturnScreen;
          setForceClaim(false);
          setClaimSessionDismissed(true);
          setClaimReturnScreen("home");
          setScreen(back);
        }}
      />
    );
  } else if (showOpenApprovals) {
    body = (
      <OpenApprovalsSheet
        phygitalTokenPda={tokenAddress}
        approvals={openApprovals.approvals}
        onChangeLimits={(code) => {
          setDismissApprovals(true);
          setScreen(settingsFromDenyCode(code));
        }}
        onDone={() => {
          setDismissApprovals(true);
          void openApprovals.refetch();
        }}
      />
    );
  } else if (screen === "send") {
    body = sendHoldPhase ? (
      <SendHoldStage
        phase={sendHoldPhase}
        imageSrc={sendAsset?.icon}
        recap={sendRecap}
        onClose={closeSend}
      />
    ) : (
      <SendDialog
        phygitalTokenPda={tokenAddress}
        walletAddress={walletAddress}
        portfolio={portfolio.data}
        initialAsset={sendAsset}
        tokensOnly={sendTokensOnly}
        onClose={closeSend}
        onHoldPhaseChange={(phase, recap) => {
          if (recap) setSendRecap(recap);
          setSendHoldPhase(phase);
        }}
        onSent={refresh}
        onChangeLimits={
          isOwner
            ? (code) => setScreen(settingsFromDenyCode(code))
            : undefined
        }
        role={role}
      />
    );
  } else if (screen === "receive") {
    body = (
      <ReceiveHub
        walletAddress={walletAddress}
        onClose={() => setScreen("home")}
        onReceiveNearby={() => setScreen("nearby")}
      />
    );
  } else if (screen === "nearby") {
    body = (
      <ReceiveNearbySheet
        recipientWallet={walletAddress}
        onClose={() => setScreen("receive")}
        onReceived={refresh}
      />
    );
  } else if (screen === "collectible" && detail) {
    body = (
      <CollectibleDetailSheet
        collectible={detail}
        onBack={() => {
          setDetail(null);
          setScreen("home");
        }}
        onSend={(c) => openSend(collectibleToSendAsset(c), false)}
        onOpenCard={
          onBackToCard && mint && detail.mint === mint
            ? () => {
                setDetail(null);
                onBackToCard();
              }
            : undefined
        }
      />
    );
  } else if (screen === "tokensAll") {
    body = (
      <TokensAllSheet
        holdings={portfolio.data?.holdings ?? []}
        onBack={() => setScreen("home")}
        onSelect={(asset) => openSend(asset, true)}
      />
    );
  } else if (screen === "collectiblesAll") {
    body = (
      <CollectiblesAllSheet
        collectibles={portfolio.data?.collectibles ?? []}
        linkedMint={mint}
        onBack={() => setScreen("home")}
        onSelect={(c) => {
          setDetail(c);
          setScreen("collectible");
        }}
      />
    );
  } else if (screen === "activity") {
    body = (
      <ActivityAllSheet
        walletAddress={walletAddress}
        onBack={() => setScreen("home")}
      />
    );
  } else if (screen === "settings") {
    body = (
      <SettingsHub
        phygitalTokenPda={tokenAddress}
        role={role}
        linkStatus={linkStatus}
        claimed={claimed}
        onBack={() => setScreen("home")}
        onOpen={(target) => {
          if (target === "recoveryWallet") {
            openRecovery("settings");
            return;
          }
          setScreen(target);
        }}
      />
    );
  } else if (screen === "feeBalance") {
    body = (
      <FeeBalanceSheet
        phygitalTokenPda={tokenAddress}
        onBack={() => setScreen("settings")}
      />
    );
  } else if (isPolicySetupScreen(screen) && !isOwner) {
    body = (
      <LimitsSetupSheet
        phygitalTokenPda={tokenAddress}
        linkStatus={linkStatus}
        claimed={claimed}
        screen={screen}
        onBack={() => setScreen("settings")}
        onClaim={requestClaim}
      />
    );
  } else if (isOwner && screen === "spendingLimits") {
    body = (
      <SpendingLimitsSheet
        phygitalTokenPda={tokenAddress}
        onBack={() => setScreen("settings")}
      />
    );
  } else if (isOwner && screen === "recipients") {
    body = (
      <RecipientsSheet
        phygitalTokenPda={tokenAddress}
        onBack={() => setScreen("settings")}
      />
    );
  } else if (isOwner && screen === "extraPrograms") {
    body = (
      <ExtraProgramsSheet
        phygitalTokenPda={tokenAddress}
        onBack={() => setScreen("settings")}
      />
    );
  } else if (isOwner && screen === "signing") {
    body = (
      <SigningSettingsSheet
        phygitalTokenPda={tokenAddress}
        onClose={() => setScreen("settings")}
      />
    );
  } else if (isOwner && screen === "recoveryWallet") {
    body = (
      <RecoveryWalletSheet
        phygitalTokenPda={tokenAddress}
        onClose={() => setScreen(recoveryReturn)}
      />
    );
  } else if (screen === "access") {
    body = (
      <AccessRecoverySheet
        phygitalTokenPda={tokenAddress}
        role={role}
        linkStatus={linkStatus}
        claimed={claimed}
        onBack={() => setScreen("settings")}
        onOpenRecovery={
          isOwner ? () => openRecovery("access") : undefined
        }
        onOpenSigning={
          isOwner ? () => setScreen("signing") : undefined
        }
        onClaim={!isOwner ? requestClaim : undefined}
        onUnlinked={() => {
          setClaimSessionDismissed(false);
          setForceClaim(false);
          setScreen("home");
        }}
      />
    );
  } else if (screen === "contacts") {
    body = <ContactsSheet onBack={() => setScreen("settings")} />;
  } else if (screen === "rpcConnection") {
    body = (
      <RpcConnectionSheet onBack={() => setScreen("settings")} />
    );
  } else {
    body = (
      <div className="flex flex-1 flex-col">
        <WalletHomePanel
          portfolio={portfolio.data}
          loading={portfolio.isLoading}
          walletAddress={walletAddress}
          walletTitle={resolvedLabel}
          linkedMint={mint}
          onSend={() => openSend(null, true)}
          onSendAsset={(asset) => openSend(asset, true)}
          onReceive={() => setScreen("receive")}
          onSelectCollectible={(c) => {
            setDetail(c);
            setScreen("collectible");
          }}
          onSeeAllTokens={() => setScreen("tokensAll")}
          onSeeAllCollectibles={() => setScreen("collectiblesAll")}
          onSeeAllActivity={() => setScreen("activity")}
          onManageDevice={onSettings}
          onAddRecovery={
            isOwner ? () => openRecovery("home") : undefined
          }
          suppressFirstRun={needsClaim}
          visitorNotice={
            isOwner
              ? null
              : linkedElsewhere
                ? copy.wallet.deviceVisitorNotice
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
          onTopUpFees={() => setScreen("feeBalance")}
          customRpcEndpoint={rpc.isCustom ? rpc.displayEndpoint : null}
          onChangeRpc={() => setScreen("rpcConnection")}
          onRefresh={refresh}
          status={
            portfolio.isError
              ? "error"
              : portfolio.isFetching || activity.isFetching
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
          activityItems={activity.items}
          activityAssetMetaByMint={activity.mintMeta}
        />
      </div>
    );
  }

  return (
    <>
      <StageTransition
        stageKey={
          showClaimSheet
            ? "claim"
            : screen === "send"
              ? `send-${sendHoldPhase ?? "form"}`
              : screen
        }
        variant="fade"
      >
        {body}
      </StageTransition>
    </>
  );
}
