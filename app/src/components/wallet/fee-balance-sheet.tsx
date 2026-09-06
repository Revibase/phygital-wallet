"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { copy } from "@/lib/copy/phygital";
import { invalidateWalletBalances } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { pushLocalWalletActivity } from "@/lib/wallet/activity-local";
import { topUpFeeBalance } from "@/lib/wallet/top-up-fee-balance";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";

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
  const [busy, setBusy] = useState(false);

  const balanceUi = fee.data?.balanceUi ?? "0";
  const feeLow = Boolean(fee.data?.low);
  const feeLoading = fee.isLoading;
  const canTopUp = Number(amount) > 0 && !busy;

  async function runTopUp() {
    if (!canTopUp) return;
    setBusy(true);
    const holdTimer = window.setTimeout(() => setPhase("holding"), 250);
    try {
      const { signature, confirmed } = await topUpFeeBalance({
        phygitalTokenPda,
        amountUi: amount,
      });
      window.clearTimeout(holdTimer);
      setPhase("holding");
      await confirmed;
      setPhase("success");
      if (walletAddress) {
        pushLocalWalletActivity({
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
          pending: false,
          source: "local",
        });
      }
      toast.success(copy.wallet.topUpSuccess);
      // Fee credit is webhook-async; SOL left the wallet immediately.
      invalidateWalletBalances(queryClient, {
        wallets: [walletAddress],
        tokens: [phygitalTokenPda],
      });
    } catch (e) {
      window.clearTimeout(holdTimer);
      setPhase("form");
      if (e instanceof PolicyDeniedError) {
        toast.error(e.message);
      } else {
        toast.error(toUserErrorMessage(e));
      }
    } finally {
      window.clearTimeout(holdTimer);
      setBusy(false);
    }
  }

  if (phase === "holding" || phase === "success") {
    return (
      <div className="flex flex-1 flex-col">
        <NavBar
          leading={
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              {copy.common.cancel}
            </Button>
          }
        />
        <NfcHoldStatus
          size="lg"
          pulsing={phase === "holding"}
          busy={phase === "holding"}
          tone={phase === "success" ? "success" : "default"}
          title={
            phase === "success"
              ? copy.wallet.topUpSuccess
              : copy.wallet.holdToTopUp
          }
          body={
            phase === "success"
              ? copy.wallet.topUpPending
              : copy.verify.holdStillBody
          }
          action={
            phase === "success" ? (
              <Button type="button" size="lg" className="w-full" onClick={onBack}>
                {copy.common.done}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
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

      <div className="mt-auto">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!canTopUp}
          onClick={() => void runTopUp()}
        >
          {busy ? (
            <Spinner className="size-4" />
          ) : (
            copy.wallet.holdToTopUp
          )}
        </Button>
      </div>
    </div>
  );
}
