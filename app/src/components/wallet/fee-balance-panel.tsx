"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
import {
  buildTopUpInstructions,
  topUpFeeBalance,
} from "@/lib/wallet/top-up-fee-balance";
import { useWalletTransaction } from "@/hooks/wallet/use-wallet-transaction";
import { WalletApprovalSheet } from "@/components/wallet/wallet-approval-sheet";
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

type TopUpSnapshot = {
  signature: string;
  feeBefore: FeeBalance | undefined;
  activityBefore: WalletActivitySnapshot | undefined;
  portfolioBefore: WalletPortfolio | undefined;
};

/** Settings → network fees: show balance + Hold to top up. */
export function FeeBalancePanel({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const fee = useFeeBalance(phygitalTokenPda);
  const { walletAddress } = useWalletPda(phygitalTokenPda);
  const queryClient = useQueryClient();
  const walletTx = useWalletTransaction(phygitalTokenPda);
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

    const outcome = await walletTx.run<TopUpSnapshot>({
      send: async (mode) => {
        if (mode === "authority") {
          const { instructions } = await buildTopUpInstructions({
            phygitalTokenPda,
            amountUi: amount,
          });
          return walletTx.sendWithAuthority(instructions);
        }
        return topUpFeeBalance({
          phygitalTokenPda,
          amountUi: amount,
          signer: {
            onPhaseChange: (phase) => {
              setSignPhase(phase);
              if (isWalletSignCeremonyPhase(phase)) setPhase("holding");
            },
          },
        });
      },
      optimistic: {
        apply: (signature) => {
          setPhase("holding");
          const feeBefore = applyOptimisticFeeBalance(queryClient, {
            token: phygitalTokenPda,
            amountUi: amount,
            direction: "in",
          });
          let activityBefore: WalletActivitySnapshot | undefined;
          let portfolioBefore: WalletPortfolio | undefined;
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
                { mint: NATIVE_SOL_MINT, direction: "out", amountUi: amount },
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
          return { signature, feeBefore, activityBefore, portfolioBefore };
        },
        confirm: (snap) => {
          if (walletAddress) {
            patchOptimisticWalletActivity(queryClient, {
              owner: walletAddress,
              id: snap.signature,
              patch: { pending: false },
            });
          }
        },
        rollback: (snap) => {
          restoreFeeBalanceSnapshot(queryClient, phygitalTokenPda, snap.feeBefore);
          if (walletAddress) {
            restorePortfolioSnapshot(
              queryClient,
              walletAddress,
              snap.portfolioBefore
            );
            restoreWalletActivitySnapshot(queryClient, snap.activityBefore);
          }
        },
      },
      onSent: () => {
        setPhase("success");
        setSignPhase(null);
      },
      onConfirmError: (err) => {
        toast.error(toUserErrorMessage(err));
      },
      onError: (e) => {
        setSignPhase(null);
        setPhase("form");
        toast.error(toUserErrorMessage(e));
      },
    });

    if (outcome.status !== "sent") {
      setSignPhase(null);
      setPhase("form");
    }
    setBusy(false);
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
      <>
      <CeremonyShell
        leading={
          phase === "success" ? undefined : (
            <NavBar
              leading={
                <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                  {copy.common.cancel}
                </Button>
              }
            />
          )
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
      <WalletApprovalSheet approval={walletTx.approval} tokenSymbol="SOL" />
      </>
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
      <WalletApprovalSheet approval={walletTx.approval} tokenSymbol="SOL" />
    </div>
  );
}
