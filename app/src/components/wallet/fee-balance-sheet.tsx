"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { copy } from "@/lib/copy/phygital";
import {
  applyOptimisticFeeBalance,
  applyOptimisticPortfolioDelta,
  applyOptimisticWalletActivity,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreWalletActivitySnapshot,
  type WalletActivitySnapshot,
} from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { topUpFeeBalance } from "@/lib/wallet/top-up-fee-balance";
import {
  NATIVE_SOL_MINT,
  resolveTokenIconSrc,
} from "@/lib/tokens/payment-token";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";
import {
  isWalletSignCeremonyPhase,
  walletSignPhaseCopy,
  type PhygitalWalletSignPhase,
} from "@/lib/wallet/sign-phase-copy";

type Phase = "form" | "holding" | "success";

/** Settings → network fees: show balance + Hold to top up. */
export function FeeBalanceSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const fee = useFeeBalance(phygitalTokenPda);
  const { walletAddress } = useWalletPda(phygitalTokenPda);
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("0.01");
  const [phase, setPhase] = useState<Phase>("form");
  const [signPhase, setSignPhase] = useState<PhygitalWalletSignPhase | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const balanceUi = fee.data?.balanceUi ?? "0";
  const feeLow = Boolean(fee.data?.low);
  const feeLoading = fee.isLoading;
  const canTopUp = Number(amount) > 0 && !busy;

  async function runTopUp() {
    if (!canTopUp) return;
    setBusy(true);
    setSignPhase(null);
    let submittedSignature: string | null = null;
    let portfolioBefore: WalletPortfolio | undefined;
    let activityBefore: WalletActivitySnapshot | undefined;
    let feeBefore: FeeBalance | undefined;
    try {
      const { signature, confirmed } = await topUpFeeBalance({
        phygitalTokenPda,
        amountUi: amount,
        signer: {
          onPhaseChange: (phase) => {
            setSignPhase(phase);
            if (isWalletSignCeremonyPhase(phase)) setPhase("holding");
          },
        },
      });
      submittedSignature = signature;
      setPhase("holding");
      feeBefore = applyOptimisticFeeBalance(queryClient, {
        token: phygitalTokenPda,
        amountUi: amount,
        direction: "in",
      });
      if (walletAddress) {
        activityBefore = applyOptimisticWalletActivity(queryClient, {
          id: signature,
          walletAddress,
          kind: "topUp",
          title: copy.wallet.topUpSuccess,
          subtitle: null,
          amountLabel: `-${amount} SOL`,
          statusLabel: copy.wallet.topUpPending,
          timestamp: Math.floor(Date.now() / 1000),
          signature,
          mint: NATIVE_SOL_MINT,
          balanceDeltas: [
            {
              mint: NATIVE_SOL_MINT,
              direction: "out",
              amountUi: amount,
            },
          ],
          pending: true,
          source: "local",
        });
        portfolioBefore = applyOptimisticPortfolioDelta(queryClient, {
          owner: walletAddress,
          mint: NATIVE_SOL_MINT,
          amountUi: amount,
          direction: "out",
        });
      }

      setPhase("success");
      setSignPhase(null);
      toast.success(copy.wallet.topUpSuccess);

      void confirmed.then(
        () => {
          if (submittedSignature && walletAddress) {
            patchOptimisticWalletActivity(queryClient, {
              owner: walletAddress,
              id: submittedSignature,
              patch: { pending: false },
            });
          }
        },
        (err) => {
          restoreFeeBalanceSnapshot(queryClient, phygitalTokenPda, feeBefore);
          if (walletAddress) {
            restorePortfolioSnapshot(
              queryClient,
              walletAddress,
              portfolioBefore
            );
            restoreWalletActivitySnapshot(queryClient, activityBefore);
          }
          toast.error(toUserErrorMessage(err));
        }
      );
    } catch (e) {
      setSignPhase(null);
      if (submittedSignature) {
        restoreFeeBalanceSnapshot(queryClient, phygitalTokenPda, feeBefore);
        if (walletAddress) {
          restorePortfolioSnapshot(queryClient, walletAddress, portfolioBefore);
          restoreWalletActivitySnapshot(queryClient, activityBefore);
        }
      }
      setPhase("form");
      if (e instanceof PolicyDeniedError) {
        toast.error(e.message);
      } else {
        toast.error(toUserErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (phase === "holding" || phase === "success") {
    const holdingCopy = signPhase
      ? walletSignPhaseCopy(signPhase)
      : {
          title: copy.wallet.holdToTopUp,
          body: copy.wallet.holdCeremonyBody,
          pulse: true,
        };
    return (
      <CeremonyShell
        leading={
          <NavBar
            leading={
              <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                {copy.common.cancel}
              </Button>
            }
          />
        }
      >
        <NfcHoldStatus
          size="lg"
          pulsing={phase === "holding" && holdingCopy.pulse}
          busy={phase === "holding" && !holdingCopy.pulse}
          progress={phase === "holding"}
          tone={phase === "success" ? "success" : "default"}
          imageSrc={resolveTokenIconSrc(NATIVE_SOL_MINT, null)}
          title={
            phase === "success" ? copy.wallet.topUpSuccess : holdingCopy.title
          }
          body={
            phase === "success" ? copy.wallet.topUpPending : holdingCopy.body
          }
          action={
            phase === "success" ? (
              <Button
                type="button"
                size="lg"
                className="w-full rounded-full"
                onClick={onBack}
              >
                {copy.common.done}
              </Button>
            ) : undefined
          }
        />
      </CeremonyShell>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.feeBalance}
      />

      <div className="flex flex-col gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          {copy.wallet.feeBalanceHint}
        </p>
        <p className="font-(family-name:--font-display) text-3xl tabular-nums">
          {feeLoading ? "…" : `${balanceUi} SOL`}
        </p>
        {feeLow ? (
          <p className="text-sm text-muted-foreground">
            {copy.wallet.feeBalanceLow}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel className="px-1 normal-case tracking-normal text-xs">
          {copy.wallet.topUpAmount}
        </FieldLabel>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.01"
        />
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!canTopUp}
        onClick={() => void runTopUp()}
      >
        {busy ? <Spinner className="size-4" /> : copy.wallet.holdToTopUp}
      </Button>
    </div>
  );
}
