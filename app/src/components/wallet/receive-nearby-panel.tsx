"use client";

import { useEffect, useMemo, useState } from "react";
import { address } from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { NavBar } from "@/components/shared/nav-bar";
import { TokenIcon } from "@/components/shared/token-chip";
import { WalletQrCode } from "@/components/wallet/wallet-qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVerifiedTokens } from "@/hooks/wallet/use-verified-tokens";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import { brand, copy } from "@/lib/copy/phygital";
import {
  applyOptimisticPortfolioDelta,
  applyOptimisticWalletActivity,
  invalidateWalletBalances,
  patchOptimisticWalletActivity,
  queryKeys,
  queryOptions,
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "@/lib/queries";
import { shortAddress } from "@/lib/utils";
import { toUserErrorMessage } from "@/lib/user-errors";
import { policySoftDenyBody } from "@/lib/wallet/policy-deny-copy";
import { ALL_LIST_SEARCH_THRESHOLD } from "@/lib/wallet/portfolio-preview";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import { receiveAssetFromNearbyPayer } from "@/lib/wallet/send-asset";
import {
  isFundingDenial,
  runWalletTransaction,
} from "@/lib/wallet/wallet-transaction";
import {
  isNativeSolHolding,
  resolveTokenIconSrc,
} from "@/lib/tokens/payment-token";
import { uiAmountToRaw } from "@/lib/tokens/amount";
import { connectAccessory } from "@/lib/wallet/connect-accessory";
import { walletPdaForToken } from "@/lib/wallet/pda";
import { resolveRecipientAtaFunding } from "@/lib/wallet/recipient-ata-funding";
import {
  isWalletSignCeremonyPhase,
  walletSignPhaseCopy,
  type PhygitalWalletSignPhase,
} from "@/lib/wallet/sign-phase-copy";
import {
  paymentTokenToSendAsset,
  type SendAssetRef,
} from "@/lib/wallet/send-asset-ref";
import { Spinner } from "@/components/ui/spinner";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";

type LinkedPayer = {
  walletPda: string;
  tokenPda: string;
};

type Phase =
  | "form"
  | "identifying"
  | "summary"
  | "holding"
  | "success"
  | "handoff";

/**
 * Receive nearby — amount → Hold (identify) → summary → Hold (confirm pay).
 * Both holds use the same primary CTA pattern.
 */
export function ReceiveNearbyPanel({
  recipientWallet,
  onClose,
  onReceived,
}: {
  recipientWallet: string;
  onClose: () => void;
  onReceived: () => void;
}) {
  const queryClient = useQueryClient();
  const verified = useVerifiedTokens();
  const catalog = verified.data ?? [];
  const catalogLoading = verified.isLoading && !verified.data;
  const [asset, setAsset] = useState<SendAssetRef | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<LinkedPayer | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [signPhase, setSignPhase] = useState<PhygitalWalletSignPhase | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [hardError, setHardError] = useState<string | null>(null);
  const [handoffDeny, setHandoffDeny] = useState<PolicyDeniedError | null>(
    null,
  );

  const payerPortfolio = useWalletPortfolio(from?.walletPda ?? null);
  const payUrl = `solana:${recipientWallet.trim()}?label=${encodeURIComponent(
    brand.company,
  )}`;

  useEffect(() => {
    if (verified.isError) toast.error(toUserErrorMessage(verified.error));
  }, [verified.isError, verified.error]);

  useEffect(() => {
    const first = verified.data?.[0];
    if (!first) return;
    setAsset((prev) => prev ?? paymentTokenToSendAsset(first));
  }, [verified.data]);

  const payerHolding = useMemo(() => {
    if (!from || !asset || !payerPortfolio.data) return null;
    return (
      payerPortfolio.data.holdings.find((x) => x.mint === asset.mint) ?? null
    );
  }, [from, asset, payerPortfolio.data]);

  const payerBalanceKnown = Boolean(from && asset && payerPortfolio.data);
  const payerBalanceUi = payerBalanceKnown
    ? (payerHolding?.balanceUi ?? "0")
    : null;
  const payerBalanceRaw = payerHolding?.balanceRaw ?? "0";
  const payerSolLamports = useMemo(() => {
    if (!payerPortfolio.data) return null;
    const sol = payerPortfolio.data.holdings.find(isNativeSolHolding);
    return BigInt(sol?.balanceRaw ?? "0");
  }, [payerPortfolio.data]);

  const ataFunding = useQuery({
    queryKey: queryKeys.recipientAtaFunding.byRecipientMint(
      recipientWallet,
      asset?.mint ?? null,
      asset?.tokenProgram ?? null,
      asset?.kind ?? null,
    ),
    queryFn: () =>
      resolveRecipientAtaFunding({
        recipientWallet,
        mint: asset!.mint,
        tokenProgram: asset!.tokenProgram,
        kind: asset!.kind,
      }),
    enabled: Boolean(
      from && asset && phase === "summary" && asset.kind !== "native",
    ),
    ...queryOptions.volatile,
  });

  const ataFundingKnown =
    !asset ||
    asset.kind === "native" ||
    ataFunding.data != null ||
    ataFunding.isError;
  const insufficientAtaRent = Boolean(
    ataFunding.data?.needsCreate &&
      payerSolLamports != null &&
      payerSolLamports < ataFunding.data.rentLamports,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const amountOk = Number(amount) > 0;
  const overBalance = (() => {
    if (!payerBalanceKnown || !asset || !amountOk) return false;
    try {
      return uiAmountToRaw(amount, asset.decimals) > BigInt(payerBalanceRaw);
    } catch {
      return true;
    }
  })();
  const canIdentify = Boolean(asset && amountOk && !busy);
  const canConfirm = Boolean(
    from &&
      asset &&
      amountOk &&
      !busy &&
      payerBalanceKnown &&
      !overBalance &&
      !payerPortfolio.isError &&
      ataFundingKnown &&
      !insufficientAtaRent &&
      !ataFunding.isError,
  );
  const showSearch = catalog.length >= ALL_LIST_SEARCH_THRESHOLD;

  useEffect(() => {
    if (payerPortfolio.isError) {
      toast.error(toUserErrorMessage(payerPortfolio.error));
    }
  }, [payerPortfolio.isError, payerPortfolio.error]);

  useEffect(() => {
    if (ataFunding.isError) {
      toast.error(toUserErrorMessage(ataFunding.error));
    }
  }, [ataFunding.isError, ataFunding.error]);

  async function identifyFrom() {
    if (!canIdentify) return;
    setPhase("identifying");
    setBusy(true);
    try {
      const { phygitalToken } = await connectAccessory();
      const tokenPda = address(phygitalToken);
      const walletPda = await walletPdaForToken(tokenPda);
      if (String(walletPda) === recipientWallet) {
        throw new Error(copy.wallet.cantReceiveFromSelf);
      }

      setFrom({
        walletPda: String(walletPda),
        tokenPda,
      });
      setHardError(null);
      setHandoffDeny(null);
      setPhase("summary");
    } catch (e) {
      setPhase("form");
      toast.error(toUserErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function backToForm() {
    setPhase("form");
    setHardError(null);
    setHandoffDeny(null);
  }

  function changePayer() {
    setFrom(null);
    setHardError(null);
    setHandoffDeny(null);
    setPhase("form");
  }

  async function runReceive() {
    if (
      !from ||
      !asset ||
      !amountOk ||
      !payerBalanceKnown ||
      overBalance ||
      !ataFundingKnown ||
      insufficientAtaRent
    ) {
      return;
    }
    const payer = from;
    setBusy(true);
    setHardError(null);
    setHandoffDeny(null);
    setSignPhase(null);

    // Nearby receive is always a visitor flow — the recipient is not the payer
    // accessory's authority — so a policy denial routes to the QR handoff, not
    // an authority-approval fallback.
    const toHandoff = (error: PolicyDeniedError) => {
      setPhase("handoff");
      setHandoffDeny(error);
      if (isFundingDenial(error)) {
        invalidateWalletBalances(queryClient, { tokens: [payer.tokenPda] });
      }
    };

    type ReceiveSnapshot = {
      signature: string;
      recipientBefore: WalletPortfolio | undefined;
      payerBefore: WalletPortfolio | undefined;
      activityBefore: WalletActivitySnapshot;
    };

    const outcome = await runWalletTransaction<ReceiveSnapshot>({
      send: () =>
        receiveAssetFromNearbyPayer({
          payerPhygitalTokenPda: payer.tokenPda,
          expectedPayerWallet: payer.walletPda,
          recipientWallet,
          amountUi: amount,
          asset: {
            kind: asset.kind,
            mint: asset.mint,
            decimals: asset.decimals,
            tokenProgram: asset.tokenProgram,
          },
          signerConfig: {
            onPhaseChange: (phase) => {
              setSignPhase(phase);
              if (isWalletSignCeremonyPhase(phase)) setPhase("holding");
            },
          },
        }),
      optimistic: {
        apply: (signature) => {
          setPhase("holding");
          const activityBefore = applyOptimisticWalletActivity(queryClient, {
            id: signature,
            walletAddress: recipientWallet,
            kind: "received",
            title: copy.wallet.received,
            subtitle: payer.walletPda,
            amountLabel: `+${amount}`,
            statusLabel: null,
            timestamp: Math.floor(Date.now() / 1000),
            signature,
            mint: asset.mint,
            balanceDeltas: [
              { mint: asset.mint, direction: "in", amountUi: amount },
            ],
            pending: true,
            source: "local",
          });
          const recipientBefore = applyOptimisticPortfolioDelta(queryClient, {
            owner: recipientWallet,
            mint: asset.mint,
            amountUi: amount,
            direction: "in",
          });
          const payerBefore = applyOptimisticPortfolioDelta(queryClient, {
            owner: payer.walletPda,
            mint: asset.mint,
            amountUi: amount,
            direction: "out",
          });
          return { signature, recipientBefore, payerBefore, activityBefore };
        },
        confirm: (snap) => {
          patchOptimisticWalletActivity(queryClient, {
            owner: recipientWallet,
            id: snap.signature,
            patch: { pending: false },
          });
        },
        rollback: (snap) => {
          restorePortfolioSnapshot(
            queryClient,
            recipientWallet,
            snap.recipientBefore,
          );
          restorePortfolioSnapshot(
            queryClient,
            payer.walletPda,
            snap.payerBefore,
          );
          restoreWalletActivitySnapshot(queryClient, snap.activityBefore);
        },
      },
      onSent: () => {
        setPhase("success");
        setSignPhase(null);
        toast.success(copy.wallet.received);
        onReceived();
      },
      onFundingDenial: toHandoff,
      resolvePolicyDenial: async (error) => {
        toHandoff(error);
        return "rejected";
      },
      onConfirmError: (err) => {
        toast.error(toUserErrorMessage(err));
      },
      onError: (e) => {
        setSignPhase(null);
        setPhase("summary");
        toast.error(toUserErrorMessage(e));
      },
    });

    if (outcome.status === "aborted") {
      setSignPhase(null);
      setPhase("summary");
    }
    setBusy(false);
  }

  if (phase === "identifying" || phase === "holding" || phase === "success") {
    const success = phase === "success";
    const identifying = phase === "identifying";
    const holdingCopy = signPhase
      ? walletSignPhaseCopy(signPhase)
      : {
          title: copy.wallet.holdToReceive,
          body: copy.verify.holdStillBody,
          pulse: true,
        };
    return (
      <CeremonyShell
        leading={
          <NavBar
            leading={
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {copy.common.cancel}
              </Button>
            }
          />
        }
      >
        <NfcHoldStatus
          size="lg"
          pulsing={identifying || (phase === "holding" && holdingCopy.pulse)}
          busy={identifying || (phase === "holding" && !holdingCopy.pulse)}
          progress={!success}
          tone={success ? "success" : "default"}
          imageSrc={asset ? resolveTokenIconSrc(asset.mint, asset.icon) : null}
          title={
            success
              ? copy.wallet.received
              : identifying
              ? copy.wallet.tapTheirAccessory
              : holdingCopy.title
          }
          body={
            success
              ? undefined
              : identifying
              ? copy.wallet.holdCeremonyBody
              : holdingCopy.body
          }
          action={
            success ? (
              <div className="flex w-full flex-col items-center gap-3">
                <div className="w-full rounded-2xl bg-muted/25 px-4 py-3 text-center">
                  <p className="font-(family-name:--font-display) text-lg">
                    +{amount} {asset?.symbol ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.wallet.from} {shortAddress(from?.walletPda ?? "", 6)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={onClose}
                >
                  {copy.common.done}
                </Button>
              </div>
            ) : undefined
          }
        />
      </CeremonyShell>
    );
  }

  if (phase === "handoff") {
    const feeBlocked = handoffDeny?.code === "insufficient_fee_balance";
    const reason = feeBlocked
      ? copy.wallet.nearbyPolicyFeeBody
      : handoffDeny?.soft
      ? policySoftDenyBody(handoffDeny).replace(/\byour\b/gi, "their")
      : copy.wallet.nearbyPolicyBody;

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <NavBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setHandoffDeny(null);
                setPhase("summary");
              }}
            >
              {copy.common.cancel}
            </Button>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 text-center">
          <h2 className="font-(family-name:--font-display) text-2xl font-medium">
            {copy.wallet.nearbyPolicyTitle}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">{reason}</p>
          {!feeBlocked ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              {copy.wallet.nearbyPolicyBody}
            </p>
          ) : null}
          <div className="w-full max-w-sm rounded-2xl bg-muted/25 px-4 py-3 text-left">
            <p className="font-(family-name:--font-display) text-lg">
              {amount} {asset?.symbol ?? ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.wallet.from} {shortAddress(from?.walletPda ?? "", 6)}
            </p>
          </div>
          <div className="rounded-[28px] border border-border/50 bg-white p-4 shadow-sm">
            <WalletQrCode value={payUrl} size={160} className="size-40" />
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => {
            setHandoffDeny(null);
            setPhase("summary");
          }}
        >
          {copy.wallet.nearbyPolicyGotIt}
        </Button>
      </div>
    );
  }

  if (phase === "summary" && from && asset) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <NavBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={backToForm}
            >
              {copy.common.cancel}
            </Button>
          }
          title={copy.wallet.nearbySummaryTitle}
        />

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-2 text-center">
          <div className="flex flex-col items-center gap-2">
            <TokenIcon
              token={{
                mint: asset.mint,
                symbol: asset.symbol,
                icon: asset.icon,
              }}
              className="size-10"
            />
            <p className="font-(family-name:--font-display) text-4xl font-medium tracking-tight tabular-nums">
              {amount} {asset.symbol}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {copy.wallet.nearbySummaryBody}
            </p>
          </div>

          <div className="w-full max-w-sm space-y-2 text-left">
            <div className="rounded-2xl bg-muted/25 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {copy.wallet.from}
              </p>
              <p className="mt-0.5 text-sm tabular-nums">
                {shortAddress(from.walletPda, 6)}
              </p>
            </div>
            {payerBalanceUi != null ? (
              <div className="space-y-1 px-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {copy.wallet.ofAvailableAsset(payerBalanceUi, asset.symbol)}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto min-h-0 px-0 text-xs font-medium"
                    onClick={() => setAmount(payerBalanceUi)}
                  >
                    {copy.wallet.max}
                  </Button>
                </div>
                {overBalance ? (
                  <p className="text-xs text-destructive">
                    {copy.wallet.insufficientBalance}
                  </p>
                ) : null}
                {insufficientAtaRent ? (
                  <p className="text-xs text-destructive">
                    {copy.wallet.insufficientAtaRent}
                  </p>
                ) : null}
              </div>
            ) : payerPortfolio.isLoading ||
              (asset.kind !== "native" && ataFunding.isLoading) ? (
              <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Spinner className="size-3.5" />
                <span>{copy.wallet.checkingPayerBalance}</span>
              </div>
            ) : null}
          </div>

          {hardError ? (
            <div className="w-full max-w-sm rounded-2xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              <p>{hardError}</p>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full rounded-full"
          disabled={!canConfirm}
          onClick={() => void runReceive()}
        >
          {busy ? <Spinner className="size-4" /> : copy.wallet.holdToReceive}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <NavBar
        leading={
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {copy.common.cancel}
          </Button>
        }
        title={copy.wallet.receiveNearby}
      />

      <Button
        type="button"
        variant="secondary"
        disabled={catalogLoading || catalog.length === 0}
        onClick={() => setPickerOpen(true)}
        className="mx-auto h-auto min-h-0 gap-2 rounded-full bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted/60"
      >
        {catalogLoading ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : asset ? (
          <TokenIcon
            token={{
              mint: asset.mint,
              symbol: asset.symbol,
              icon: asset.icon,
            }}
            className="size-6"
          />
        ) : null}
        <span className="font-medium">
          {asset?.symbol ?? copy.wallet.selectAsset}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>

      <div className="flex flex-col items-center gap-2 pt-2">
        <div className="flex items-baseline gap-1">
          <Input
            variant="hero"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            disabled={!asset}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-label={copy.wallet.receive}
          />
        </div>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          {copy.wallet.holdToIdentifyPayerHint}
        </p>
      </div>

      {hardError ? (
        <div className="rounded-2xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          <p>{hardError}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full rounded-full"
          disabled={!canIdentify}
          onClick={() => void identifyFrom()}
        >
          {busy ? (
            <Spinner className="size-4" />
          ) : (
            copy.wallet.holdToIdentifyPayer
          )}
        </Button>
        <p className="hidden text-center text-xs text-muted-foreground md:block">
          {copy.wallet.holdToIdentifyPayerHint}
        </p>
      </div>

      <Sheet
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setSearch("");
        }}
      >
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-t-3xl md:rounded-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{copy.wallet.selectAsset}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {showSearch ? (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.wallet.searchTokens}
                className="text-sm"
              />
            ) : null}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {copy.wallet.noMatchingTokens}
              </p>
            ) : (
              <GroupedList>
                {filtered.map((t) => {
                  const ref = paymentTokenToSendAsset(t);
                  return (
                    <GroupedRow
                      key={t.mint}
                      leading={<TokenIcon token={t} className="size-8" />}
                      subtitle={t.name}
                      onClick={() => {
                        setAsset(ref);
                        setPickerOpen(false);
                        setSearch("");
                      }}
                    >
                      {t.symbol}
                    </GroupedRow>
                  );
                })}
              </GroupedList>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
