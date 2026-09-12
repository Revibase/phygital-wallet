"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";
import { ChevronDown, Nfc } from "lucide-react";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { NavBar } from "@/components/shared/nav-bar";
import { TokenIcon } from "@/components/shared/token-chip";
import type { WalletRole } from "@/components/token/token-address-route";
import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
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
import {
  applyOptimisticFeeBalance,
  applyOptimisticPortfolioDelta,
  applyOptimisticWalletActivity,
  invalidateWalletBalances,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "@/lib/queries";
import { tryParseAddress } from "@/lib/solana/address";
import { cn, shortAddress } from "@/lib/utils";
import { toUserErrorMessage } from "@/lib/user-errors";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useTokenVerifier } from "@/hooks/wallet/use-token-verifier";
import { identifyAccessory } from "@/lib/wallet/identify-accessory";
import { createOneTimeGrant } from "@/lib/wallet/policies-client";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  policyAmountLabel,
  policyApprovalDetailRows,
  policySoftDenyBody,
} from "@/lib/wallet/policy-deny-copy";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import { sendAssetFromWallet } from "@/lib/wallet/send-asset";
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
import { resolveTokenIconSrc } from "@/lib/tokens/payment-token";
import { snapEnter, snapEnterTransition } from "@/lib/motion";
import type { SendHoldRecap } from "@/components/wallet/send-hold-stage";
import { Spinner } from "@/components/ui/spinner";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";

type Phase = "form" | "holding";

type SendHardError = { message: string; code: string | null };

function defaultAsset(
  portfolio: WalletPortfolio | undefined,
  initial: SendAssetRef | null | undefined,
  tokensOnly: boolean
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

export function SendDialog({
  phygitalTokenPda,
  walletAddress,
  portfolio,
  initialAsset,
  tokensOnly = false,
  onClose,
  onHoldPhaseChange,
  onSignPhaseChange,
  onSent,
  onChangeLimits,
  role = "visitor",
}: {
  phygitalTokenPda: string;
  walletAddress: string;
  portfolio: WalletPortfolio | undefined;
  initialAsset?: SendAssetRef | null;
  tokensOnly?: boolean;
  onClose: () => void;
  onHoldPhaseChange: (
    phase: "holding" | "success" | null,
    recap?: SendHoldRecap
  ) => void;
  onSignPhaseChange?: (phase: PhygitalWalletSignPhase | null) => void;
  onSent: () => void;
  onChangeLimits?: (code?: string) => void;
  role?: WalletRole;
}) {
  const queryClient = useQueryClient();
  const [asset, setAsset] = useState<SendAssetRef | null>(() =>
    defaultAsset(portfolio, initialAsset, tokensOnly)
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState(() =>
    initialAsset && isCollectibleSendKind(initialAsset.kind) ? "1" : ""
  );
  const [recipient, setRecipient] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [hardError, setHardError] = useState<SendHardError | null>(null);
  const [softDeny, setSoftDeny] = useState<PolicyDeniedError | null>(null);
  const [visitorPhase, setVisitorPhase] = useState<"denied" | "idle">("idle");
  const sendAbortRef = useRef<AbortController | null>(null);
  const feeBalance = useFeeBalance(phygitalTokenPda);
  const tokenVerifier = useTokenVerifier(phygitalTokenPda);
  const usesFeeBalance = tokenVerifier.data?.usesDefaultPaymaster === true;
  const prefersReducedMotion = useReducedMotion();
  const enter = snapEnter(prefersReducedMotion);
  const amountInputRef = useRef<HTMLInputElement>(null);

  function dismissVisitorSheet() {
    setSoftDeny(null);
    setVisitorPhase("idle");
  }

  useEffect(() => {
    setPhase("form");
    setBusy(false);
    setHardError(null);
    dismissVisitorSheet();
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

  useEffect(() => {
    if (initialAsset && isCollectibleSendKind(initialAsset.kind)) return;
    const id = window.requestAnimationFrame(() =>
      amountInputRef.current?.focus()
    );
    return () => window.cancelAnimationFrame(id);
  }, [initialAsset]);

  const nft = asset ? isCollectibleSendKind(asset.kind) : false;
  const balanceUi = useMemo(() => {
    if (!asset || !portfolio) return "0";
    if (nft) return "1";
    const h = portfolio.holdings.find((x) => x.mint === asset.mint);
    return h?.balanceUi ?? "0";
  }, [asset, portfolio, nft]);

  const balanceNum = Number(balanceUi);
  const trimmedRecipient = recipient.trim();
  const parsedRecipient = tryParseAddress(trimmedRecipient);
  const invalidRecipient =
    trimmedRecipient.length > 0 && parsedRecipient == null;
  const selfSend = Boolean(
    parsedRecipient && String(parsedRecipient) === walletAddress
  );
  const amountNum = Number(amount);
  const overBalance =
    !nft && amount.length > 0 && amountNum > balanceNum + 1e-9;
  const amountOk =
    nft || (amountNum > 0 && Number.isFinite(amountNum) && !overBalance);
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
      !feeInsufficient
  );

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
    if (!asset || !parsedRecipient || !amountOk || selfSend) return;

    setBusy(true);
    setHardError(null);
    setSoftDeny(null);
    setVisitorPhase("idle");
    sendAbortRef.current?.abort();
    const abort = new AbortController();
    sendAbortRef.current = abort;
    const recap = recapForSend();
    const amountUi = nft ? "1" : amount;
    let submittedSignature: string | null = null;
    let portfolioBefore: WalletPortfolio | undefined;
    let activityBefore: WalletActivitySnapshot | undefined;
    let feeBefore: FeeBalance | undefined;

    const showHolding = () => {
      setPhase("holding");
      onHoldPhaseChange("holding", recap);
    };

    try {
      const { signature, confirmed } = await sendAssetFromWallet({
        phygitalTokenPda,
        recipient: parsedRecipient,
        amountUi,
        asset: {
          kind: asset.kind,
          mint: asset.mint,
          decimals: asset.decimals,
          tokenProgram: asset.tokenProgram,
        },
        abortSignal: abort.signal,
        signer: {
          onPhaseChange: (phase) => {
            onSignPhaseChange?.(phase);
            if (isWalletSignCeremonyPhase(phase)) {
              setSoftDeny(null);
              setVisitorPhase("idle");
              showHolding();
            }
          },
        },
      });

      submittedSignature = signature;
      showHolding();
      if (usesFeeBalance) {
        feeBefore = applyOptimisticFeeBalance(queryClient, {
          token: phygitalTokenPda,
          amountUi: lamportsToSolUi(MIN_ATTEMPT_FEE_LAMPORTS),
          direction: "out",
        });
      }
      activityBefore = applyOptimisticWalletActivity(queryClient, {
        id: signature,
        walletAddress,
        kind: "sent",
        title: nft ? copy.wallet.sent : `Sent ${asset.symbol}`,
        subtitle: String(parsedRecipient),
        amountLabel: nft ? asset.name : `-${amount}`,
        statusLabel: null,
        timestamp: Math.floor(Date.now() / 1000),
        signature,
        mint: asset.mint,
        balanceDeltas: [
          {
            mint: asset.mint,
            direction: "out",
            amountUi,
          },
        ],
        pending: true,
        source: "local",
      });
      portfolioBefore = applyOptimisticPortfolioDelta(queryClient, {
        owner: walletAddress,
        mint: asset.mint,
        amountUi,
        direction: "out",
        removeCollectible: nft,
      });

      onHoldPhaseChange("success", recapForSend(signature));
      onSignPhaseChange?.(null);
      toast.success(copy.wallet.sent);
      onSent();

      void confirmed.then(
        () => {
          patchOptimisticWalletActivity(queryClient, {
            owner: walletAddress,
            id: signature,
            patch: { pending: false },
          });
        },
        (err) => {
          restoreFeeBalanceSnapshot(queryClient, phygitalTokenPda, feeBefore);
          restorePortfolioSnapshot(queryClient, walletAddress, portfolioBefore);
          restoreWalletActivitySnapshot(queryClient, activityBefore);
          toast.error(toUserErrorMessage(err));
        }
      );
    } catch (e) {
      if (submittedSignature) {
        restoreFeeBalanceSnapshot(queryClient, phygitalTokenPda, feeBefore);
        restorePortfolioSnapshot(queryClient, walletAddress, portfolioBefore);
        restoreWalletActivitySnapshot(queryClient, activityBefore);
      }
      onSignPhaseChange?.(null);
      onHoldPhaseChange(null);
      if (
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError")
      ) {
        setPhase("form");
        dismissVisitorSheet();
        return;
      }
      if (e instanceof PolicyDeniedError) {
        if (e.code === "approval_denied") {
          setSoftDeny(e);
          setVisitorPhase("denied");
          setPhase("form");
          return;
        }
        if (e.soft && e.intentHash) {
          setSoftDeny(e);
          setVisitorPhase("idle");
          setPhase("form");
          return;
        }
        setPhase("form");
        setHardError({
          code: e.code,
          message:
            e.code === "insufficient_fee_balance"
              ? copy.wallet.feeBalanceInsufficient
              : toUserErrorMessage(e),
        });
        if (e.code === "insufficient_fee_balance") {
          invalidateWalletBalances(queryClient, {
            tokens: [phygitalTokenPda],
          });
        }
        return;
      }
      setPhase("form");
      toast.error(toUserErrorMessage(e));
    } finally {
      if (sendAbortRef.current === abort) {
        sendAbortRef.current = null;
      }
      setBusy(false);
    }
  }

  async function approveOnce() {
    if (!softDeny?.intentHash) return;
    setBusy(true);
    try {
      await createOneTimeGrant(phygitalTokenPda, softDeny.intentHash);
      setSoftDeny(null);
      setVisitorPhase("idle");
      await runSend();
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      toast.error(toUserErrorMessage(e));
      setBusy(false);
    }
  }

  const holdings = portfolio?.holdings ?? [];
  const collectibles = tokensOnly ? [] : portfolio?.collectibles ?? [];

  if (phase === "holding") {
    // Parent swaps to SendHoldStage for the NFC ceremony.
    return null;
  }

  const form = (
    <LazyMotion features={domAnimation}>
      <m.div
        className="flex flex-1 flex-col gap-5 md:mx-auto md:w-full md:max-w-xl lg:max-w-lg"
        initial={enter.initial}
        animate={enter.animate}
        transition={snapEnterTransition}
      >
        <NavBar
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

        <Button
          asChild
          variant="secondary"
          className="mx-auto h-auto min-h-0 gap-2 rounded-full bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted/60"
        >
          <m.button
            type="button"
            onClick={() => setPickerOpen(true)}
            whileHover={{ y: -1, scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
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
          </m.button>
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
                ref={amountInputRef}
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
                  amount ? "text-foreground" : "text-muted-foreground/50"
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
                transition={{ duration: 0.18, ease: "easeOut" }}
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
              transition={{ duration: 0.2, ease: "easeOut" }}
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
          <m.div whileTap={{ scale: canSend ? 0.995 : 1 }}>
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!canSend}
              onClick={() => void runSend()}
            >
              {busy ? <Spinner className="size-4" /> : copy.wallet.holdToSend}
            </Button>
          </m.div>
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

        <Sheet
          open={softDeny != null}
          onOpenChange={(open) => {
            if (open) return;
            if (!busy) dismissVisitorSheet();
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
              else dismissVisitorSheet();
            }}
            className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0 md:rounded-3xl"
          >
            {softDeny ? (
              <ApprovalSheetBody
                title={
                  role === "owner"
                    ? copy.wallet.approveSendTitle
                    : visitorPhase === "denied"
                    ? copy.wallet.visitorDeniedTitle
                    : copy.wallet.nearbyPolicyTitle
                }
                body={
                  role === "owner"
                    ? policySoftDenyBody(softDeny)
                    : visitorPhase === "denied"
                    ? copy.wallet.visitorDeniedBody
                    : copy.wallet.visitorNeedsApprovalBody
                }
                hint={
                  role === "owner" || visitorPhase === "denied"
                    ? undefined
                    : copy.wallet.visitorNeedsApprovalHint
                }
                amountLabel={
                  nft
                    ? asset?.name ?? "1"
                    : policyAmountLabel(softDeny.details, asset?.symbol) ??
                      `${amount} ${asset?.symbol ?? ""}`.trim()
                }
                recipientLabel={shortAddress(
                  String(parsedRecipient ?? recipient),
                  6
                )}
                detailRows={policyApprovalDetailRows(softDeny.details, {
                  omitAmount: true,
                  omitDestination: true,
                  omitMint: Boolean(asset?.symbol || softDeny.details?.symbol),
                  omitTechnical: true,
                })}
                busy={busy}
                mode={role === "owner" ? "owner" : "visitor"}
                visitorPhase={role === "owner" ? "idle" : visitorPhase}
                onApprove={() => void approveOnce()}
                onClose={() => dismissVisitorSheet()}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      </m.div>
    </LazyMotion>
  );

  return form;
}
