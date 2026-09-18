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
import { walletDesktopTitleClass } from "@/lib/layout";
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
import { buildTopUpInstructions } from "@/lib/wallet/top-up-fee-balance";
import { useWalletTransaction } from "@/hooks/wallet/use-wallet-transaction";
import { WalletApprovalSheet } from "@/components/wallet/wallet-approval-sheet";
import {
  NATIVE_SOL_MINT,
  resolveTokenIconSrc,
} from "@/lib/tokens/payment-token";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";

type Phase = "form" | "success";

type TopUpSnapshot = {
  signature: string;
  feeBefore: FeeBalance | undefined;
  activityBefore: WalletActivitySnapshot | undefined;
  portfolioBefore: WalletPortfolio | undefined;
};

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
  const [busy, setBusy] = useState(false);

  const balanceUi = fee.data?.balanceUi ?? "0";
  const feeLow = Boolean(fee.data?.low);
  const feeLoading = fee.isLoading;
  const canTopUp = Number(amount) > 0 && !busy;

  async function runTopUp() {
    if (!canTopUp) return;
    setBusy(true);

    const outcome = await walletTx.run<TopUpSnapshot>({
      preferredMode: "authority",
      send: async () => {
        const { instructions } = await buildTopUpInstructions({
          phygitalTokenPda,
          amountUi: amount,
        });
        return walletTx.sendWithAuthority(instructions);
      },
      optimistic: {
        apply: (signature) => {
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
      },
      onConfirmError: (err) => {
        toast.error(toUserErrorMessage(err));
      },
      onError: (e) => {
        setPhase("form");
        toast.error(toUserErrorMessage(e));
      },
    });

    if (outcome.status !== "sent") {
      setPhase("form");
    }
    setBusy(false);
  }

  if (phase === "success") {
    return (
      <>
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            tone="success"
            imageSrc={resolveTokenIconSrc(NATIVE_SOL_MINT, null)}
            title={copy.wallet.topUpSuccess}
            body={copy.wallet.topUpPending}
            action={
              <Button
                type="button"
                size="lg"
                className="w-full rounded-full"
                onClick={onBack}
              >
                {copy.common.done}
              </Button>
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
        desktopHidden
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.feeBalance}
      />

      <div className="flex flex-col gap-2">
        <h2 className={walletDesktopTitleClass}>{copy.wallet.feeBalance}</h2>
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
        {busy ? <Spinner className="size-4" /> : copy.wallet.confirmToTopUp}
      </Button>
      <WalletApprovalSheet approval={walletTx.approval} tokenSymbol="SOL" />
    </div>
  );
}
