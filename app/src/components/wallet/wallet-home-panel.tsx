"use client";

import { useMemo } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Clock3, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CollectiblesGrid } from "@/components/wallet/collectibles-grid";
import { TokenHoldingRow } from "@/components/wallet/token-holding-row";
import { WalletPanelSkeleton } from "@/components/wallet/wallet-panel-skeleton";
import { GroupedList } from "@/components/shared/grouped-list";
import { copy } from "@/lib/copy/phygital";
import type {
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
import { walletPortfolioSplitClass } from "@/lib/layout";
import {
  snapEnter,
  snapEnterTransition,
  easeOut,
  duration,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Shared Wallet panel — calm home: capped tokens + collectibles, See All. */
const EMPTY_HOLDINGS: WalletPortfolio["holdings"] = [];
const EMPTY_COLLECTIBLES: WalletPortfolio["collectibles"] = [];
const sectionTransition = {
  duration: 0.18,
  ease: easeOut,
};

export function WalletHomePanel({
  portfolio,
  loading,
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
  visitorNotice,
  status = "live",
  className,
}: {
  portfolio: WalletPortfolio | undefined;
  loading?: boolean;
  onSend: () => void;
  onSendAsset: (asset: SendAssetRef) => void;
  onReceive: () => void;
  onSelectCollectible: (c: WalletCollectible) => void;
  onSeeAllTokens: () => void;
  onSeeAllCollectibles: () => void;
  /** Opens activity screen — history is fetched only then. */
  onSeeAllActivity: () => void;
  feeBalanceLow?: boolean;
  onTopUpFees?: () => void;
  /** Masked host when a custom RPC is active (Backpack-style reminder). */
  customRpcEndpoint?: string | null;
  onChangeRpc?: () => void;
  onRefresh?: () => void;
  lastUpdatedLabel?: string | null;
  /** Quiet visitor role notice (not linked as owner on this phone). */
  visitorNotice?: string | null;
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
  const tokenPreview = useMemo(() => previewHoldings(holdings), [holdings]);
  const collectiblePreview = useMemo(
    () => previewCollectibles(collectibles),
    [collectibles],
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
    ? `${formatCompactTokenAmount(primaryHolding.balanceUi)} ${
        primaryHolding.symbol
      }`
    : null;
  // Under a USD total, show spendable USDC — not whichever altcoin ranks #1 by $ value.
  const heroSubtitle =
    showUsdHero && usdcHolding
      ? `${formatCompactTokenAmount(usdcHolding.balanceUi)} ${
          usdcHolding.symbol
        }`
      : showUsdHero
      ? null
      : primaryCryptoLine;
  const heroValue = showUsdHero
    ? formatUsd(totalUsd)
    : primaryCryptoLine
    ? primaryCryptoLine
    : formatUsd(0);
  const refreshing = status === "refreshing";

  if (loading && !portfolio) {
    return <WalletPanelSkeleton variant="home" className={className} />;
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
          className="flex flex-col items-center gap-1.5 py-1 text-center lg:items-start lg:text-left"
          variants={sectionVariants}
          transition={sectionTransition}
        >
          <m.h1
            className="text-balance-hero tabular-nums"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.985, y: 8 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{ duration: duration.normal, ease: easeOut }}
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
          {lastUpdatedLabel || onRefresh ? (
            <div className="flex items-center justify-center gap-1 lg:justify-start">
              {lastUpdatedLabel ? (
                <p className="text-xs text-muted-foreground">
                  {lastUpdatedLabel}
                </p>
              ) : null}
              {onRefresh ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.wallet.refresh}
                  className="size-7 min-h-7 min-w-7 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={onRefresh}
                >
                  <RefreshCcw
                    className={cn("size-3.5", refreshing ? "animate-spin" : "")}
                    aria-hidden
                  />
                </Button>
              ) : null}
            </div>
          ) : null}
        </m.div>

        <m.div
          className="mx-auto flex w-full max-w-xl items-center justify-center gap-3 px-2 lg:hidden"
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
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={onSeeAllActivity}
            className="h-12 min-h-12 flex-1 rounded-full border border-border/50 bg-card/80 text-[0.9375rem] font-semibold backdrop-blur-sm"
          >
            <Clock3 className="size-4" aria-hidden />
            {copy.wallet.activity}
          </Button>
        </m.div>

        {visitorNotice ? <QuietNotice label={visitorNotice} /> : null}

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

        {!empty &&
        (tokenPreview.length > 0 || collectiblePreview.length > 0) ? (
          <m.div
            className={cn(
              tokenPreview.length > 0 && collectiblePreview.length > 0
                ? walletPortfolioSplitClass
                : "flex flex-col gap-6",
            )}
            variants={sectionVariants}
            transition={sectionTransition}
          >
            {tokenPreview.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-1.5">
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
                    <TokenHoldingRow
                      key={h.mint}
                      holding={h}
                      onSelect={onSendAsset}
                    />
                  ))}
                </GroupedList>
              </section>
            ) : null}

            {collectiblePreview.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-2.5">
                <div className="flex items-baseline justify-between px-4">
                  <h2 className="text-section-label">
                    {copy.wallet.collectibles}
                  </h2>
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
                  layout="responsive"
                />
              </section>
            ) : null}
          </m.div>
        ) : null}
      </m.div>
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
        className="rounded-2xl bg-muted/20 px-4 py-2.5"
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
      className="h-auto min-h-0 w-full justify-between gap-3 rounded-2xl bg-muted/20 px-4 py-2.5 text-left hover:bg-muted/30"
      onClick={onClick}
    >
      <p className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
        {label}
      </p>
      <span className="shrink-0 text-xs font-medium text-primary">
        {action}
      </span>
    </Button>
  );
}
