"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "@/lib/queries";
import { shortAddress } from "@/lib/utils";
import { toUserErrorMessage } from "@/lib/user-errors";
import { identifyAccessory } from "@/lib/wallet/identify-accessory";
import { policySoftDenyBody } from "@/lib/wallet/policy-deny-copy";
import { ALL_LIST_SEARCH_THRESHOLD } from "@/lib/wallet/portfolio-preview";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import { receiveAssetFromNearbyPayer } from "@/lib/wallet/send-asset";
import { resolveTokenIconSrc } from "@/lib/tokens/payment-token";
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
export function ReceiveNearbySheet({
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
  const payUrl = `solana:${recipientWallet.trim()}?label=${encodeURIComponent(brand.company)}`;

  useEffect(() => {
    if (verified.isError) toast.error(toUserErrorMessage(verified.error));
  }, [verified.isError, verified.error]);

  useEffect(() => {
    const first = verified.data?.[0];
    if (!first) return;
    setAsset((prev) => prev ?? paymentTokenToSendAsset(first));
  }, [verified.data]);

  const payerBalanceUi = useMemo(() => {
    if (!from || !asset || !payerPortfolio.data) return null;
    return (
      payerPortfolio.data.holdings.find((x) => x.mint === asset.mint)
        ?.balanceUi ?? "0"
    );
  }, [from, asset, payerPortfolio.data]);

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
  const canIdentify = Boolean(asset && amountOk && !busy);
  const canConfirm = Boolean(from && asset && amountOk && !busy);
  const showSearch = catalog.length >= ALL_LIST_SEARCH_THRESHOLD;

  async function identifyFrom() {
    if (!canIdentify) return;
    setPhase("identifying");
    setBusy(true);
    try {
      const id = await identifyAccessory();
      if (String(id.walletPda) === recipientWallet) {
        throw new Error(copy.wallet.cantReceiveFromSelf);
      }
      setFrom({
        walletPda: String(id.walletPda),
        tokenPda: String(id.token.address),
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
    if (!from || !asset || !amountOk) return;
    setBusy(true);
    setHardError(null);
    setHandoffDeny(null);
    setSignPhase(null);
    let submittedSignature: string | null = null;
    let recipientBefore: WalletPortfolio | undefined;
    let payerBefore: WalletPortfolio | undefined;
    let activityBefore: WalletActivitySnapshot | undefined;
    try {
      const { signature, confirmed } = await receiveAssetFromNearbyPayer({
        payerPhygitalTokenPda: from.tokenPda,
        expectedPayerWallet: from.walletPda,
        recipientWallet,
        amountUi: amount,
        asset: {
          kind: asset.kind,
          mint: asset.mint,
          decimals: asset.decimals,
          tokenProgram: asset.tokenProgram,
        },
        signer: {
          onPhaseChange: (phase) => {
            setSignPhase(phase);
            if (isWalletSignCeremonyPhase(phase)) setPhase("holding");
          },
          onError: () => setSignPhase(null),
        },
      });
      submittedSignature = signature;
      setPhase("holding");
      activityBefore = applyOptimisticWalletActivity(queryClient, {
        id: signature,
        walletAddress: recipientWallet,
        kind: "received",
        title: `Received ${asset.symbol}`,
        subtitle: from.walletPda,
        amountLabel: `+${amount}`,
        statusLabel: null,
        timestamp: Math.floor(Date.now() / 1000),
        signature,
        mint: asset.mint,
        balanceDeltas: [
          {
            mint: asset.mint,
            direction: "in",
            amountUi: amount,
          },
        ],
        pending: true,
        source: "local",
      });
      recipientBefore = applyOptimisticPortfolioDelta(queryClient, {
        owner: recipientWallet,
        mint: asset.mint,
        amountUi: amount,
        direction: "in",
      });
      payerBefore = applyOptimisticPortfolioDelta(queryClient, {
        owner: from.walletPda,
        mint: asset.mint,
        amountUi: amount,
        direction: "out",
      });

      setPhase("success");
      setSignPhase(null);
      toast.success(copy.wallet.received);
      onReceived();

      void confirmed.then(
        () => {
          patchOptimisticWalletActivity(queryClient, {
            owner: recipientWallet,
            id: signature,
            patch: { pending: false },
          });
        },
        (err) => {
          restorePortfolioSnapshot(queryClient, recipientWallet, recipientBefore);
          if (from) {
            restorePortfolioSnapshot(queryClient, from.walletPda, payerBefore);
          }
          restoreWalletActivitySnapshot(queryClient, activityBefore);
          toast.error(toUserErrorMessage(err));
        },
      );
    } catch (e) {
      setSignPhase(null);
      if (submittedSignature) {
        restorePortfolioSnapshot(queryClient, recipientWallet, recipientBefore);
        if (from) {
          restorePortfolioSnapshot(queryClient, from.walletPda, payerBefore);
        }
        restoreWalletActivitySnapshot(queryClient, activityBefore);
      }
      if (e instanceof PolicyDeniedError) {
        setPhase("handoff");
        setHandoffDeny(e);
        if (e.code === "insufficient_fee_balance") {
          invalidateWalletBalances(queryClient, {
            tokens: [from.tokenPda],
          });
        }
        return;
      }
      setPhase("summary");
      toast.error(toUserErrorMessage(e));
    } finally {
      setBusy(false);
    }
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
          pulsing={
            identifying || (phase === "holding" && holdingCopy.pulse)
          }
          busy={
            identifying || (phase === "holding" && !holdingCopy.pulse)
          }
          progress={!success}
          tone={success ? "success" : "default"}
          imageSrc={
            asset
              ? resolveTokenIconSrc(asset.mint, asset.icon)
              : null
          }
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
                    {copy.wallet.from}{" "}
                    {shortAddress(from?.walletPda ?? "", 6)}
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
            <Button type="button" variant="ghost" size="sm" onClick={backToForm}>
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
              <p className="text-xs text-muted-foreground">{copy.wallet.from}</p>
              <p className="mt-0.5 text-sm tabular-nums">
                {shortAddress(from.walletPda, 6)}
              </p>
            </div>
            {payerBalanceUi != null ? (
              <div className="flex items-center justify-between px-1">
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
            ) : null}
          </div>

          {hardError ? (
            <div className="w-full max-w-sm rounded-2xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              <p>{hardError}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={!canConfirm}
            onClick={() => void runReceive()}
          >
            {busy ? <Spinner className="size-4" /> : copy.wallet.holdToReceive}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={backToForm}
          >
            {copy.wallet.nearbyChangeDetails}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            disabled={busy}
            onClick={changePayer}
          >
            {copy.wallet.nearbyChangePayer}
          </Button>
          <p className="hidden text-center text-xs text-muted-foreground md:block">
            {copy.wallet.holdToReceiveDesktopHint}
          </p>
        </div>
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
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9.]/g, ""))
            }
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
          className="mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-t-3xl"
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
