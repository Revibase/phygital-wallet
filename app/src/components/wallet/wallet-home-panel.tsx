"use client";

import { useMemo } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, RefreshCcw, Settings } from "lucide-react";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityList } from "@/components/wallet/activity-list";
import { CollectiblesGrid } from "@/components/wallet/collectibles-grid";
import { TokenHoldingRow } from "@/components/wallet/token-holding-row";
import { GroupedList } from "@/components/shared/grouped-list";
import { useLocalFlag } from "@/lib/local-flag";
import { copy } from "@/lib/copy/phygital";
import type {
  WalletActivityItem,
  WalletCollectible,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";
import type { SendAssetRef } from "@/lib/wallet/send-asset-ref";
import {
  HOME_COLLECTIBLE_PREVIEW,
  HOME_TOKEN_PREVIEW,
  previewCollectibles,
  previewHoldings,
} from "@/lib/wallet/portfolio-preview";
import { formatUsd, sumUsd } from "@/lib/currency/usd";
import { formatCompactTokenAmount } from "@/lib/tokens/amount";
import { isDefaultMint } from "@/lib/tokens/payment-token";
import { snapEnter, snapEnterTransition, easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

const FIRST_RUN_FLAG = "revibase.first-run.wallet.v1";
const RECOVERY_ACK_FLAG = "revibase.recovery-ack.v1";

/** Shared Wallet panel — calm home: capped tokens + collectibles, See All. */
const EMPTY_HOLDINGS: WalletPortfolio["holdings"] = [];
const EMPTY_COLLECTIBLES: WalletPortfolio["collectibles"] = [];
const SKELETON_ROWS = ["wallet-home-1", "wallet-home-2", "wallet-home-3"] as const;
const sectionTransition = {
  duration: 0.18,
  ease: easeOut,
};

export function WalletHomePanel({
  portfolio,
  loading,
  walletAddress,
  walletTitle,
  linkedMint,
  onManageDevice,
  onSend,
  onSendAsset,
  onReceive,
  onSelectCollectible,
  onSeeAllTokens,
  onSeeAllCollectibles,
  onSeeAllActivity,
  feeBalanceLow,
  onTopUpFees,
  customRpcEndpoint,
  onChangeRpc,
  onRefresh,
  lastUpdatedLabel,
  activityItems,
  activityAssetMetaByMint,
  visitorNotice,
  onVisitorNotice,
  visitorNoticeAction,
  onAddRecovery,
  suppressFirstRun = false,
  status = "live",
  className,
}: {
  portfolio: WalletPortfolio | undefined;
  loading?: boolean;
  walletAddress: string;
  /** Accessory / card name — primary identity above the address. */
  walletTitle?: string | null;
  linkedMint?: string | null;
  onSend: () => void;
  onSendAsset: (asset: SendAssetRef) => void;
  onReceive: () => void;
  onSelectCollectible: (c: WalletCollectible) => void;
  onSeeAllTokens: () => void;
  onSeeAllCollectibles: () => void;
  onSeeAllActivity?: () => void;
  feeBalanceLow?: boolean;
  onTopUpFees?: () => void;
  /** Masked host when a custom RPC is active (Backpack-style reminder). */
  customRpcEndpoint?: string | null;
  onChangeRpc?: () => void;
  onRefresh?: () => void;
  lastUpdatedLabel?: string | null;
  activityItems?: WalletActivityItem[];
  activityAssetMetaByMint?: Record<string, { symbol: string; name: string }>;
  onManageDevice: () => void;
  /** Owner: open recovery set/clear from the first-funds ack. */
  onAddRecovery?: () => void;
  /** Quiet visitor role notice (not linked as owner on this phone). */
  visitorNotice?: string | null;
  visitorNoticeAction?: string;
  onVisitorNotice?: () => void;
  /** Claim ceremony wins over empty-wallet first-run. */
  suppressFirstRun?: boolean;
  status?: "live" | "refreshing" | "error";
  className?: string;
}) {
  const holdings = portfolio?.holdings ?? EMPTY_HOLDINGS;
  const collectibles = portfolio?.collectibles ?? EMPTY_COLLECTIBLES;
  const hasFungible = holdings.some((h) => Number(h.balanceUi) > 0);
  const empty = !loading && holdings.length === 0 && collectibles.length === 0;
  const prefersReducedMotion = useReducedMotion();
  const sectionVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0 },
      };
  const [firstRunDismissed, setFirstRunDismissed] = useLocalFlag(FIRST_RUN_FLAG);
  const [recoveryAcked, setRecoveryAcked] = useLocalFlag(RECOVERY_ACK_FLAG);
  const showFirstRun =
    empty && !linkedMint && !firstRunDismissed && !suppressFirstRun;
  const showRecoveryAck =
    Boolean(onAddRecovery) && hasFungible && !recoveryAcked;

  const tokenPreview = useMemo(() => previewHoldings(holdings), [holdings]);
  const collectiblePreview = useMemo(
    () => previewCollectibles(collectibles, linkedMint),
    [collectibles, linkedMint],
  );
  const moreTokens = holdings.length > HOME_TOKEN_PREVIEW;
  const moreCollectibles = collectibles.length > HOME_COLLECTIBLE_PREVIEW;

  const primaryHolding = tokenPreview[0];
  const usdcHolding = holdings.find((h) => isDefaultMint(h.mint));

  const hasUsd = holdings.some(
    (h) => typeof h.valueUsd === "number" && Number.isFinite(h.valueUsd),
  );
  const totalUsd = hasUsd ? sumUsd(holdings.map((h) => h.valueUsd)) : 0;

  // Prices cover mainnet top volume only; fall back to the largest holding.
  const showUsdHero = hasUsd && totalUsd > 0;
  const primaryCryptoLine = primaryHolding
    ? `${formatCompactTokenAmount(primaryHolding.balanceUi)} ${primaryHolding.symbol}`
    : null;
  // Under a USD total, show spendable USDC — not whichever altcoin ranks #1 by $ value.
  const heroSubtitle =
    showUsdHero && usdcHolding
      ? `${formatCompactTokenAmount(usdcHolding.balanceUi)} ${usdcHolding.symbol}`
      : showUsdHero
        ? null
        : primaryCryptoLine;
  const heroValue = showUsdHero
    ? formatUsd(totalUsd)
    : primaryCryptoLine
      ? primaryCryptoLine
      : formatUsd(0);
  const showStatus = status === "error" || status === "refreshing";
  const statusLabel =
    status === "error"
      ? copy.wallet.balancesUpdateFailed
      : copy.wallet.balancesUpdating;
  const refreshing = status === "refreshing";

  if (loading && !portfolio) {
    return (
      <div className={cn("flex flex-1 flex-col gap-6", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>

        <div className="flex flex-col items-center gap-2 py-1 text-center">
          <Skeleton className="h-10 w-44 rounded-2xl" />
          <Skeleton className="h-4 w-32" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="size-12 rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="size-12 rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
          <Skeleton className="size-9 rounded-2xl" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Skeleton className="mx-4 h-3 w-16" />
          <div className="overflow-hidden rounded-2xl bg-grouped">
            {SKELETON_ROWS.map((key) => (
              <Skeleton key={key} className="h-14 rounded-none bg-muted/20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={cn("flex flex-1 flex-col gap-6", className)}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: prefersReducedMotion ? 0 : 0.028,
              delayChildren: 0,
            },
          },
        }}
      >
      <m.div
        className="flex items-start justify-between gap-3"
        variants={sectionVariants}
        transition={sectionTransition}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {walletTitle ? (
            <p className="truncate text-sm font-medium tracking-tight">
              {walletTitle}
            </p>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5">
            <CopyableAddress
              address={walletAddress}
              length={4}
              label={copy.address.wallet}
              className={cn(
                "min-h-8 text-muted-foreground",
                walletTitle ? "text-[11px]" : "min-h-11 text-xs",
              )}
            />
            {onRefresh ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy.wallet.refresh}
                className="rounded-full text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
              >
                <RefreshCcw
                  className={cn("size-3.5", refreshing ? "animate-spin" : "")}
                  aria-hidden
                />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {showStatus ? (
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-0 gap-1.5 px-2 py-1"
              onClick={status === "error" ? onRefresh : undefined}
              disabled={status !== "error" || !onRefresh}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "error"
                    ? "bg-muted-foreground"
                    : "bg-muted-foreground/70",
                )}
                aria-hidden
              />
              <span className="text-xs font-medium text-muted-foreground">
                {statusLabel}
              </span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={copy.wallet.manageDevice}
            onClick={onManageDevice}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        </div>
      </m.div>

      {!showFirstRun ? (
      <m.div
        className="flex flex-col items-center gap-1.5 py-1 text-center"
        variants={sectionVariants}
        transition={sectionTransition}
      >
        <m.h1
          className="text-balance-hero tabular-nums"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 8 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          {heroValue}
        </m.h1>
        {empty ? (
          <Button
            type="button"
            variant="link"
            onClick={onReceive}
            className="h-auto min-h-0 px-0 text-sm font-medium text-primary"
          >
            {copy.wallet.addMoney}
          </Button>
        ) : (
          <>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              {copy.wallet.available}
            </p>
            {heroSubtitle ? (
              <p className="text-sm text-muted-foreground tabular-nums">
                {heroSubtitle}
              </p>
            ) : null}
          </>
        )}
        {lastUpdatedLabel ? (
          <p className="text-xs text-muted-foreground">{lastUpdatedLabel}</p>
        ) : null}
      </m.div>
      ) : null}

      {showFirstRun ? (
        <m.div
          className="mx-4 flex flex-col gap-4 rounded-3xl border border-border/30 bg-card/70 px-5 py-6 text-center shadow-[0_16px_48px_-28px_var(--card-shadow)] backdrop-blur-md"
          variants={sectionVariants}
          transition={sectionTransition}
        >
          <div className="space-y-2">
            <p className="text-large-title">{copy.wallet.firstRunTitle}</p>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
              {copy.wallet.firstRunBody}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button type="button" size="lg" className="w-full" onClick={onReceive}>
              {copy.wallet.firstRunCta}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => setFirstRunDismissed(true)}
            >
              {copy.wallet.firstRunDismiss}
            </Button>
          </div>
        </m.div>
      ) : null}

      {!showFirstRun ? (
      <m.div
        className="flex w-full items-center justify-center gap-3 px-2"
        variants={sectionVariants}
        transition={sectionTransition}
      >
        <Button
          type="button"
          size="lg"
          disabled={!hasFungible}
          title={!hasFungible ? copy.wallet.sendNeedsFunds : undefined}
          aria-label={
            !hasFungible
              ? `${copy.wallet.send}. ${copy.wallet.sendNeedsFunds}`
              : copy.wallet.send
          }
          onClick={onSend}
          className="h-12 min-h-12 flex-1 rounded-full text-[0.9375rem] font-semibold shadow-sm"
        >
          <ArrowUp className="size-4" aria-hidden />
          {copy.wallet.send}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          onClick={onReceive}
          className="h-12 min-h-12 flex-1 rounded-full border border-border/50 bg-card/80 text-[0.9375rem] font-semibold backdrop-blur-sm"
        >
          <ArrowDown className="size-4" aria-hidden />
          {copy.wallet.receive}
        </Button>
      </m.div>
      ) : null}

      {visitorNotice ? (
        <QuietNotice
          label={visitorNotice}
          action={visitorNoticeAction}
          onClick={onVisitorNotice}
        />
      ) : null}

      {customRpcEndpoint && onChangeRpc ? (
        <QuietNotice
          label={copy.wallet.rpcBannerBody(customRpcEndpoint)}
          action={copy.wallet.rpcBannerChange}
          onClick={onChangeRpc}
        />
      ) : null}

      {feeBalanceLow && onTopUpFees ? (
        <QuietNotice
          label={copy.wallet.feeBalanceLow}
          action={copy.wallet.topUpFees}
          onClick={onTopUpFees}
        />
      ) : null}

      {!empty && tokenPreview.length > 0 ? (
        <m.section
          className="flex flex-col gap-1.5"
          variants={sectionVariants}
          transition={sectionTransition}
        >
          <div className="flex items-baseline justify-between px-4 pt-1">
            <h2 className="text-section-label">{copy.wallet.tokens}</h2>
            {moreTokens ? (
              <Button
                type="button"
                variant="link"
                onClick={onSeeAllTokens}
                className="h-auto min-h-0 px-0 text-xs font-medium"
              >
                {copy.wallet.seeAll}
              </Button>
            ) : null}
          </div>
          <GroupedList>
            {tokenPreview.map((h) => (
              <TokenHoldingRow key={h.mint} holding={h} onSelect={onSendAsset} />
            ))}
          </GroupedList>
        </m.section>
      ) : null}

      {!empty && collectiblePreview.length > 0 ? (
        <m.section
          className="flex flex-col gap-2.5"
          variants={sectionVariants}
          transition={sectionTransition}
        >
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-section-label">{copy.wallet.collectibles}</h2>
            {moreCollectibles ? (
              <Button
                type="button"
                variant="link"
                onClick={onSeeAllCollectibles}
                className="h-auto min-h-0 px-0 text-xs font-medium"
              >
                {copy.wallet.seeAll}
              </Button>
            ) : null}
          </div>
          <CollectiblesGrid
            collectibles={collectiblePreview}
            onSelect={onSelectCollectible}
            layout="strip"
          />
        </m.section>
      ) : null}
      {activityItems?.length ? (
        <m.section
          className="flex flex-col gap-1.5"
          variants={sectionVariants}
          transition={sectionTransition}
        >
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-section-label">{copy.wallet.activity}</h2>
            {onSeeAllActivity ? (
              <Button
                type="button"
                variant="link"
                onClick={onSeeAllActivity}
                className="h-auto min-h-0 px-0 text-xs font-medium"
              >
                {copy.wallet.seeAll}
              </Button>
            ) : null}
          </div>
          <ActivityList
            items={activityItems.slice(0, 4)}
            emptyLabel={copy.wallet.noActivity}
            assetMetaByMint={activityAssetMetaByMint}
          />
        </m.section>
      ) : null}
      </m.div>
      <Dialog open={showRecoveryAck} onOpenChange={(open) => {
        if (!open) setRecoveryAcked(true);
      }}>
        <DialogContent className="max-w-sm p-6">
          <div className="space-y-3">
            <DialogTitle className="text-base font-medium">
              {copy.wallet.recoveryAckTitle}
            </DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {copy.wallet.recoveryAckBody}
            </p>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                setRecoveryAcked(true);
                onAddRecovery?.();
              }}
            >
              {copy.wallet.recoveryAckCta}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => setRecoveryAcked(true)}
            >
              {copy.wallet.recoveryAckSkip}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </LazyMotion>
  );
}

function QuietNotice({
  label,
  action,
  onClick,
}: {
  label: string;
  action?: string;
  onClick?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const enter = snapEnter(prefersReducedMotion);
  if (!action || !onClick) {
    return (
      <m.div
        className="mx-4 rounded-2xl bg-muted/20 px-4 py-2.5"
        initial={enter.initial}
        animate={enter.animate}
        transition={snapEnterTransition}
      >
        <p className="text-xs text-muted-foreground">{label}</p>
      </m.div>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      asChild
      className="mx-4 h-auto min-h-0 w-[calc(100%-2rem)] justify-between gap-3 rounded-2xl bg-muted/20 px-4 py-2.5 text-left hover:bg-muted/30"
    >
      <m.button
        type="button"
        onClick={onClick}
        initial={enter.initial}
        animate={enter.animate}
        whileTap={{ scale: 0.99 }}
        transition={snapEnterTransition}
      >
        <p className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
          {label}
        </p>
        <span className="shrink-0 text-xs font-medium text-primary">{action}</span>
      </m.button>
    </Button>
  );
}
