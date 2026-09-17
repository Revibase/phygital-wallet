"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";
import { ChevronDown, Nfc } from "lucide-react";
import { toast } from "sonner";

import { NavBar } from "@/components/shared/nav-bar";
import { TokenIcon } from "@/components/shared/token-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { copy } from "@/lib/copy/phygital";
import { walletDesktopTitleClass, walletFormColumnClass } from "@/lib/layout";
import {
  applyOptimisticFeeBalance,
  applyOptimisticPortfolioDelta,
  applyOptimisticWalletActivity,
  invalidateWalletBalances,
  patchOptimisticWalletActivity,
  queryKeys,
  queryOptions,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "@/lib/queries";
import { tryParseAddress } from "@/lib/solana/address";
import { cn, shortAddress } from "@/lib/utils";
import { toUserErrorMessage } from "@/lib/user-errors";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { identifyAccessory } from "@/lib/wallet/identify-accessory";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import {
  buildSendAssetInstructions,
  sendAssetFromWallet,
} from "@/lib/wallet/send-asset";
import { resolveRecipientAtaFunding } from "@/lib/wallet/recipient-ata-funding";
import { useWalletTransaction } from "@/hooks/wallet/use-wallet-transaction";
import { WalletApprovalSheet } from "@/components/wallet/wallet-approval-sheet";
import {
  isWalletSignCeremonyPhase,
  type PhygitalWalletSignPhase,
} from "@/lib/wallet/sign-phase-copy";
import {
  collectibleToSendAsset,
  holdingToSendAsset,
  isCollectibleSendKind,
  type SendAssetRef,
} from "@/lib/wallet/send-asset-ref";
import {
  FEE_BALANCE_LOW_LAMPORTS,
  lamportsToSolUi,
  MIN_ATTEMPT_FEE_LAMPORTS,
} from "@/lib/wallet/network-fee";
import { sanitizeDecimalInput } from "@/lib/tokens/amount";
import {
  isNativeSolHolding,
  resolveTokenIconSrc,
} from "@/lib/tokens/payment-token";
import { snapEnter, snapEnterTransition } from "@/lib/motion";
import type {
  SendCeremonyState,
  SendHoldRecap,
} from "@/components/wallet/send-hold-stage";
import { Spinner } from "@/components/ui/spinner";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";

type Phase = "form" | "holding";

type SendHardError = { message: string; code: string | null };

type SendSnapshot = {
  signature: string;
  feeBefore: FeeBalance | undefined;
  activityBefore: WalletActivitySnapshot;
  portfolioBefore: WalletPortfolio | undefined;
};

function defaultAsset(
  portfolio: WalletPortfolio | undefined,
  initial: SendAssetRef | null | undefined,
  tokensOnly: boolean,
): SendAssetRef | null {
  if (initial) return initial;
  const holdings = portfolio?.holdings ?? [];
  const first = holdings.find((h) => Number(h.balanceUi) > 0) ?? holdings[0];
  if (first) return holdingToSendAsset(first);
  if (!tokensOnly) {
    const c = portfolio?.collectibles[0];
    if (c) return collectibleToSendAsset(c);
  }
  return null;
}

export function SendFlow({
  phygitalTokenPda,
  walletAddress,
  portfolio,
  initialAsset,
  tokensOnly = false,
  onClose,
  onCeremonyChange,
  onSent,
  onChangeLimits,
}: {
  phygitalTokenPda: string;
  walletAddress: string;
  portfolio: WalletPortfolio | undefined;
  initialAsset?: SendAssetRef | null;
  tokensOnly?: boolean;
  onClose: () => void;
  onCeremonyChange: (state: SendCeremonyState) => void;
  onSent?: () => void;
  onChangeLimits?: (code?: string) => void;
}) {
  const queryClient = useQueryClient();
  const walletTx = useWalletTransaction(phygitalTokenPda);
  const [asset, setAsset] = useState<SendAssetRef | null>(() =>
    defaultAsset(portfolio, initialAsset, tokensOnly),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState(() =>
    initialAsset && isCollectibleSendKind(initialAsset.kind) ? "1" : "",
  );
  const [recipient, setRecipient] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [hardError, setHardError] = useState<SendHardError | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const feeBalance = useFeeBalance(phygitalTokenPda);
  const usesFeeBalance = true;
  const prefersReducedMotion = useReducedMotion();
  const enter = snapEnter(prefersReducedMotion);

  useEffect(() => {
    setPhase("form");
    setBusy(false);
    setHardError(null);
    sendAbortRef.current = null;
    setPickerOpen(false);
    setRecipient("");
    const nextAsset = defaultAsset(portfolio, initialAsset, tokensOnly);
    setAsset(nextAsset);
    setAmount(nextAsset && isCollectibleSendKind(nextAsset.kind) ? "1" : "");
    // portfolio intentionally omitted — background refetches must not reset the form.
  }, [initialAsset, tokensOnly]);

  useEffect(() => {
    if (asset) return;
    const next = defaultAsset(portfolio, initialAsset, tokensOnly);
    if (!next) return;
    setAsset(next);
    setAmount(isCollectibleSendKind(next.kind) ? "1" : "");
  }, [portfolio, initialAsset, tokensOnly, asset]);

  const nft = asset ? isCollectibleSendKind(asset.kind) : false;
  const balanceUi = useMemo(() => {
    if (!asset || !portfolio) return "0";
    if (nft) return "1";
    const h = portfolio.holdings.find((x) => x.mint === asset.mint);
    return h?.balanceUi ?? "0";
  }, [asset, portfolio, nft]);

  const senderSolLamports = useMemo(() => {
    if (!portfolio) return null;
    const sol = portfolio.holdings.find(isNativeSolHolding);
    return BigInt(sol?.balanceRaw ?? "0");
  }, [portfolio]);

  const balanceNum = Number(balanceUi);
  const trimmedRecipient = recipient.trim();
  const parsedRecipient = tryParseAddress(trimmedRecipient);
  const invalidRecipient =
    trimmedRecipient.length > 0 && parsedRecipient == null;
  const selfSend = Boolean(
    parsedRecipient && String(parsedRecipient) === walletAddress,
  );
  const amountNum = Number(amount);
  const overBalance =
    !nft && amount.length > 0 && amountNum > balanceNum + 1e-9;
  const amountOk =
    nft || (amountNum > 0 && Number.isFinite(amountNum) && !overBalance);

  const needsAtaFundingCheck = Boolean(
    asset &&
      parsedRecipient &&
      !selfSend &&
      asset.kind !== "native" &&
      asset.kind !== "cnft" &&
      asset.kind !== "core",
  );
  const ataFunding = useQuery({
    queryKey: queryKeys.recipientAtaFunding.byRecipientMint(
      parsedRecipient ? String(parsedRecipient) : null,
      asset?.mint ?? null,
      asset?.tokenProgram ?? null,
      asset?.kind ?? null,
    ),
    queryFn: () =>
      resolveRecipientAtaFunding({
        recipientWallet: String(parsedRecipient!),
        mint: asset!.mint,
        tokenProgram: asset!.tokenProgram,
        kind: asset!.kind,
      }),
    enabled: needsAtaFundingCheck,
    ...queryOptions.volatile,
  });
  const ataFundingKnown =
    !needsAtaFundingCheck || ataFunding.data != null || ataFunding.isError;
  const insufficientAtaRent = Boolean(
    ataFunding.data?.needsCreate &&
      senderSolLamports != null &&
      senderSolLamports < ataFunding.data.rentLamports,
  );

  const feeBalanceLamports = feeBalance.data?.balanceLamports;
  const feeBalanceKnown = typeof feeBalanceLamports === "number";
  const feeInsufficient =
    usesFeeBalance &&
    asset != null &&
    feeBalanceKnown &&
    feeBalanceLamports < MIN_ATTEMPT_FEE_LAMPORTS;
  const feeLow =
    usesFeeBalance &&
    asset != null &&
    feeBalanceKnown &&
    !feeInsufficient &&
    feeBalanceLamports < FEE_BALANCE_LOW_LAMPORTS;

  const canSend = Boolean(
    asset &&
      parsedRecipient &&
      amountOk &&
      !selfSend &&
      !busy &&
      !feeInsufficient &&
      ataFundingKnown &&
      !insufficientAtaRent &&
      !ataFunding.isError,
  );

  useEffect(() => {
    if (ataFunding.isError) {
      toast.error(toUserErrorMessage(ataFunding.error));
    }
  }, [ataFunding.isError, ataFunding.error]);

  function recapForSend(signature?: string | null): SendHoldRecap {
    const recipientLabel = parsedRecipient
      ? shortAddress(String(parsedRecipient), 6)
      : trimmedRecipient;
    return {
      amountLabel: nft
        ? asset?.name ?? copy.wallet.sendCollectible
        : `${amount} ${asset?.symbol ?? ""}`.trim(),
      recipientLabel,
      feeLabel: !usesFeeBalance
        ? null
        : feeInsufficient
        ? copy.wallet.feeBalanceInsufficient
        : feeLow
        ? copy.wallet.feeBalanceLow
        : copy.wallet.networkFeeFromBalanceShort,
      signature: signature ?? null,
      recipientAddress: parsedRecipient ? String(parsedRecipient) : null,
      mint: asset?.mint ?? null,
      amountUi: nft ? "1" : amount,
      walletAddress,
      imageSrc: asset ? resolveTokenIconSrc(asset.mint, asset.icon) : null,
    };
  }

  async function pickRecipientNfc() {
    setBusy(true);
    try {
      const id = await identifyAccessory();
      setRecipient(String(id.walletPda));
      toast.success(copy.wallet.accessoryLinked);
    } catch (e) {
      toast.error(toUserErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSend() {
    if (
      !asset ||
      !parsedRecipient ||
      !amountOk ||
      selfSend ||
      !ataFundingKnown ||
      insufficientAtaRent
    ) {
      return;
    }

    setBusy(true);
    setHardError(null);
    sendAbortRef.current?.abort();
    const abort = new AbortController();
    sendAbortRef.current = abort;
    const recap = recapForSend();
    const amountUi = nft ? "1" : amount;
    const recipient = parsedRecipient;
    const assetFields = {
      kind: asset.kind,
      mint: asset.mint,
      decimals: asset.decimals,
      tokenProgram: asset.tokenProgram,
    };

    const showHolding = (signPhase: PhygitalWalletSignPhase | null = null) => {
      if (walletTx.isOwnerBrowse) return;
      setPhase("holding");
      onCeremonyChange({ stage: "holding", signPhase, recap });
    };

    const outcome = await walletTx.run<SendSnapshot>({
      send: async (mode) => {
        if (mode === "authority") {
          const { instructions } = await buildSendAssetInstructions({
            phygitalTokenPda,
            recipient,
            amountUi,
            asset: assetFields,
          });
          return walletTx.sendWithAuthority(instructions, abort.signal);
        }
        return sendAssetFromWallet({
          phygitalTokenPda,
          recipient,
          amountUi,
          asset: assetFields,
          abortSignal: abort.signal,
          signerConfig: {
            onPhaseChange: (phase) => {
              if (isWalletSignCeremonyPhase(phase)) showHolding(phase);
            },
          },
        });
      },
      optimistic: {
        apply: (signature) => {
          showHolding();
          const feeBefore = usesFeeBalance
            ? applyOptimisticFeeBalance(queryClient, {
                token: phygitalTokenPda,
                amountUi: lamportsToSolUi(MIN_ATTEMPT_FEE_LAMPORTS),
                direction: "out",
              })
            : undefined;
          const activityBefore = applyOptimisticWalletActivity(queryClient, {
            id: signature,
            walletAddress,
            kind: "sent",
            title: copy.wallet.sent,
            subtitle: String(recipient),
            amountLabel: nft ? asset.name : `-${amount}`,
            statusLabel: null,
            timestamp: Math.floor(Date.now() / 1000),
            signature,
            mint: asset.mint,
            balanceDeltas: [{ mint: asset.mint, direction: "out", amountUi }],
            pending: true,
            source: "local",
          });
          const portfolioBefore = applyOptimisticPortfolioDelta(queryClient, {
            owner: walletAddress,
            mint: asset.mint,
            amountUi,
            direction: "out",
            removeCollectible: nft,
          });
          return { signature, feeBefore, activityBefore, portfolioBefore };
        },
        confirm: (snap) => {
          patchOptimisticWalletActivity(queryClient, {
            owner: walletAddress,
            id: snap.signature,
            patch: { pending: false },
          });
        },
        rollback: (snap) => {
          restoreFeeBalanceSnapshot(
            queryClient,
            phygitalTokenPda,
            snap.feeBefore,
          );
          restorePortfolioSnapshot(
            queryClient,
            walletAddress,
            snap.portfolioBefore,
          );
          restoreWalletActivitySnapshot(queryClient, snap.activityBefore);
        },
      },
      onSent: (signature) => {
        onCeremonyChange({
          stage: "success",
          recap: recapForSend(signature),
        });
        onSent?.();
      },
      onFundingDenial: (e) => {
        setPhase("form");
        onCeremonyChange({ stage: "idle" });
        setHardError({
          code: e.code,
          message: copy.wallet.feeBalanceInsufficient,
        });
        invalidateWalletBalances(queryClient, { tokens: [phygitalTokenPda] });
      },
      onConfirmError: (err) => {
        toast.error(toUserErrorMessage(err));
      },
      onError: (e) => {
        setPhase("form");
        onCeremonyChange({ stage: "idle" });
        toast.error(toUserErrorMessage(e));
      },
    });

    if (outcome.status !== "sent") {
      // Aborted / rejected (visitor / owner denied) / error — drop back to the
      // form. Funding denials keep their own inline error (set above).
      setPhase("form");
      onCeremonyChange({ stage: "idle" });
    }

    if (sendAbortRef.current === abort) sendAbortRef.current = null;
    setBusy(false);
  }

  const holdings = portfolio?.holdings ?? [];
  const collectibles = tokensOnly ? [] : portfolio?.collectibles ?? [];

  if (phase === "holding") {
    // Parent swaps to SendHoldStage for the NFC ceremony; the approval modal
    // still needs to surface over it if policy denies mid-ceremony.
    return (
      <WalletApprovalSheet
        approval={walletTx.approval}
        tokenSymbol={asset?.symbol}
      />
    );
  }

  const form = (
    <LazyMotion features={domAnimation}>
      <m.div
        className={walletFormColumnClass}
        initial={enter.initial}
        animate={enter.animate}
        transition={snapEnterTransition}
      >
        <NavBar
          desktopHidden
          className="mb-0"
          leading={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              {copy.common.cancel}
            </Button>
          }
          title={copy.wallet.send}
        />
        <h1 className={walletDesktopTitleClass}>{copy.wallet.send}</h1>

        <Button
          type="button"
          variant="secondary"
          className="mx-auto h-auto min-h-0 gap-2 rounded-full bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted/60"
          onClick={() => setPickerOpen(true)}
        >
          {asset ? (
            nft ? (
              <Avatar className="size-6">
                {asset.icon ? <AvatarImage src={asset.icon} alt="" /> : null}
                <AvatarFallback className="text-[10px]">
                  {asset.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <TokenIcon
                token={{
                  mint: asset.mint,
                  symbol: asset.symbol,
                  icon: asset.icon,
                }}
                className="size-6"
              />
            )
          ) : null}
          <span className="font-medium">
            {asset
              ? nft
                ? asset.name
                : asset.symbol
              : copy.wallet.selectAsset}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>

        <m.div
          className="flex flex-col items-center gap-2 py-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snapEnterTransition}
        >
          {nft ? (
            <>
              <p className="font-(family-name:--font-display) text-4xl font-light tabular-nums">
                1
              </p>
              <p className="text-sm text-muted-foreground">
                {copy.wallet.sendCollectible}
              </p>
            </>
          ) : (
            <>
              <Input
                variant="hero"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) =>
                  setAmount(sanitizeDecimalInput(e.target.value))
                }
                aria-label={copy.wallet.send}
                className={cn(
                  "max-w-full",
                  amount ? "text-foreground" : "text-muted-foreground/50",
                )}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {copy.wallet.ofAvailableAsset(balanceUi, asset?.symbol ?? "")}
                </span>
                <span className="text-muted-foreground/40" aria-hidden>
                  ·
                </span>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-0 px-0 font-medium text-foreground/90 no-underline hover:text-foreground"
                  onClick={() => setAmount(balanceUi)}
                >
                  {copy.wallet.max}
                </Button>
              </div>
              {overBalance ? (
                <p className="text-xs text-destructive">
                  {copy.wallet.insufficientBalance}
                </p>
              ) : null}
            </>
          )}
        </m.div>

        <m.div
          className="flex flex-col gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snapEnterTransition}
        >
          <FieldLabel className="px-1 normal-case tracking-normal text-xs">
            {copy.wallet.to}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder={copy.wallet.pasteAddress}
              className="flex-1 font-mono text-sm"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={copy.wallet.tapAccessory}
              disabled={busy}
              onClick={() => void pickRecipientNfc()}
              className="shrink-0"
            >
              {busy && phase === "form" ? (
                <Spinner className="size-4" />
              ) : (
                <Nfc className="size-4" />
              )}
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {parsedRecipient ? (
              <m.p
                key={String(parsedRecipient)}
                className="px-1 text-xs text-muted-foreground"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={snapEnterTransition}
              >
                {shortAddress(String(parsedRecipient), 6)}
              </m.p>
            ) : null}
          </AnimatePresence>
          {invalidRecipient ? (
            <p className="px-1 text-xs text-destructive">
              {copy.wallet.invalidAddress}
            </p>
          ) : null}
          {selfSend ? (
            <p className="px-1 text-xs text-destructive">
              {copy.wallet.selfSend}
            </p>
          ) : null}
          {insufficientAtaRent ? (
            <p className="px-1 text-xs text-destructive">
              {copy.wallet.insufficientAtaRentSend}
            </p>
          ) : null}
        </m.div>

        {asset && usesFeeBalance ? (
          feeInsufficient ? (
            <div className="rounded-2xl bg-muted/20 px-4 py-3">
              <p className="text-sm text-destructive">
                {copy.wallet.feeBalanceInsufficient}
              </p>
              {onChangeLimits ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-auto min-h-0 px-0 text-xs font-medium"
                  onClick={() => onChangeLimits("insufficient_fee_balance")}
                >
                  {copy.wallet.topUpFees}
                </Button>
              ) : null}
            </div>
          ) : feeLow ? (
            <div className="rounded-2xl bg-muted/20 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {copy.wallet.feeBalanceLow}
              </p>
              {onChangeLimits ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-auto min-h-0 px-0 text-xs font-medium"
                  onClick={() => onChangeLimits("insufficient_fee_balance")}
                >
                  {copy.wallet.topUpFees}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="px-1 text-center text-xs text-muted-foreground">
              {copy.wallet.networkFeeFromBalance}
            </p>
          )
        ) : null}

        <AnimatePresence initial={false}>
          {hardError ? (
            <m.div
              className="rounded-2xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={snapEnterTransition}
            >
              <p>{hardError.message}</p>
              {onChangeLimits ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-auto min-h-0 px-0 text-xs font-medium"
                  onClick={() => onChangeLimits(hardError.code ?? undefined)}
                >
                  {hardError.code === "insufficient_fee_balance"
                    ? copy.wallet.topUpFees
                    : copy.wallet.changeLimits}
                </Button>
              ) : null}
            </m.div>
          ) : null}
        </AnimatePresence>

        <m.div
          className="pt-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snapEnterTransition}
        >
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!canSend}
            onClick={() => void runSend()}
          >
            {busy ? (
              <>
                <Spinner className="size-4" />
                {copy.wallet.signPreparingTitle}
              </>
            ) : walletTx.isOwnerBrowse ? (
              copy.wallet.confirmToSend
            ) : (
              copy.wallet.holdToSend
            )}
          </Button>
        </m.div>

        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-t-3xl md:rounded-3xl"
          >
            <SheetHeader className="text-left">
              <SheetTitle>{copy.wallet.selectAsset}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              {holdings.length > 0 ? (
                <GroupedList label={copy.wallet.tokens}>
                  {holdings.map((h) => {
                    const ref = holdingToSendAsset(h);
                    return (
                      <GroupedRow
                        key={h.mint}
                        leading={
                          <TokenIcon
                            token={{
                              mint: h.mint,
                              symbol: h.symbol,
                              icon: h.icon,
                            }}
                            className="size-8"
                          />
                        }
                        trailing={
                          <p className="text-sm tabular-nums">{h.balanceUi}</p>
                        }
                        subtitle={h.name}
                        onClick={() => {
                          setAsset(ref);
                          if (isCollectibleSendKind(ref.kind)) setAmount("1");
                          else if (nft) setAmount("");
                          setPickerOpen(false);
                        }}
                      >
                        {h.symbol}
                      </GroupedRow>
                    );
                  })}
                </GroupedList>
              ) : null}

              {collectibles.length > 0 ? (
                <GroupedList label={copy.wallet.collectibles}>
                  {collectibles.map((c) => {
                    const ref = collectibleToSendAsset(c);
                    return (
                      <GroupedRow
                        key={c.mint}
                        leading={
                          <Avatar className="size-8 rounded-lg">
                            {c.image ? (
                              <AvatarImage
                                src={c.image}
                                alt=""
                                className="rounded-lg"
                              />
                            ) : null}
                            <AvatarFallback className="rounded-lg text-[10px]">
                              {c.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        }
                        subtitle={c.collectionName}
                        onClick={() => {
                          setAsset(ref);
                          setAmount("1");
                          setPickerOpen(false);
                        }}
                      >
                        {c.name}
                      </GroupedRow>
                    );
                  })}
                </GroupedList>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </m.div>
    </LazyMotion>
  );

  return (
    <>
      {form}
      <WalletApprovalSheet
        approval={walletTx.approval}
        tokenSymbol={asset?.symbol}
      />
    </>
  );
}
