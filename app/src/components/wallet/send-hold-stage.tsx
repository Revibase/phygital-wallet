"use client";

import { useState } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";

import { NavBar } from "@/components/shared/nav-bar";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { ActivityReceiptSheet } from "@/components/wallet/activity-receipt-sheet";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { snapEnter, snapEnterTransition } from "@/lib/motion";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";
import {
  walletSignPhaseCopy,
  type PhygitalWalletSignPhase,
} from "@/lib/wallet/sign-phase-copy";

export type SendHoldRecap = {
  amountLabel: string;
  recipientLabel: string;
  feeLabel?: string | null;
  signature?: string | null;
  /** Full recipient address for receipt sheet. */
  recipientAddress?: string | null;
  mint?: string | null;
  amountUi?: string | null;
  walletAddress?: string | null;
  /** Icon for the asset actually being sent (not the URL-preselected one). */
  imageSrc?: string | null;
};

export function SendHoldStage({
  phase,
  signPhase,
  imageSrc,
  recap,
  onClose,
}: {
  phase: "holding" | "success";
  /** Live wrap/sign stage while `phase === "holding"`. */
  signPhase?: PhygitalWalletSignPhase | null;
  imageSrc?: string | null;
  recap?: SendHoldRecap | null;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const enter = snapEnter(prefersReducedMotion);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const holdingCopy = signPhase
    ? walletSignPhaseCopy(signPhase)
    : {
        title: copy.wallet.holdCeremonyTitle,
        body: copy.wallet.holdCeremonyBody,
        pulse: true,
      };

  const receiptItem: WalletActivityItem | null =
    phase === "success" && recap?.signature && recap.walletAddress
      ? {
          id: recap.signature,
          walletAddress: recap.walletAddress,
          kind: "sent",
          title: copy.wallet.sent,
          subtitle: recap.recipientAddress ?? recap.recipientLabel,
          amountLabel: recap.amountLabel.startsWith("-")
            ? recap.amountLabel
            : `-${recap.amountLabel}`,
          statusLabel: null,
          timestamp: Math.floor(Date.now() / 1000),
          signature: recap.signature,
          mint: recap.mint ?? null,
          balanceDeltas:
            recap.mint && recap.amountUi
              ? [
                  {
                    mint: recap.mint,
                    direction: "out",
                    amountUi: recap.amountUi,
                  },
                ]
              : undefined,
          pending: false,
          source: "local",
        }
      : null;

  return (
    <LazyMotion features={domAnimation}>
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
        {/*
          Keep one mounted ceremony tree across signPhase changes and
          holding→success so the orb does not remount / flicker.
        */}
        <div className="flex min-h-0 flex-1 flex-col">
          <NfcHoldStatus
            size="lg"
            pulsing={phase === "holding" && holdingCopy.pulse}
            busy={phase === "holding" && !holdingCopy.pulse}
            progress={phase === "holding"}
            tone={phase === "success" ? "success" : "default"}
            imageSrc={recap?.imageSrc ?? imageSrc}
            title={phase === "success" ? copy.wallet.sent : holdingCopy.title}
            body={phase === "success" ? undefined : holdingCopy.body}
            action={
              <div className="flex w-full flex-col items-center gap-3">
                {recap ? (
                  <div className="w-full rounded-2xl bg-muted/25 px-4 py-3 text-center">
                    <p className="font-(family-name:--font-display) text-lg">
                      {recap.amountLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {copy.wallet.to} {recap.recipientLabel}
                    </p>
                    {recap.feeLabel ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {recap.feeLabel}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {phase === "success" ? (
                  <m.div
                    className="flex w-full flex-col gap-2"
                    initial={enter.initial}
                    animate={enter.animate}
                    transition={snapEnterTransition}
                  >
                    {receiptItem ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="w-full"
                        onClick={() => setReceiptOpen(true)}
                      >
                        {copy.wallet.viewReceipt}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="lg"
                      className="w-full"
                      onClick={onClose}
                    >
                      {copy.common.done}
                    </Button>
                  </m.div>
                ) : null}
              </div>
            }
          />
        </div>
        <ActivityReceiptSheet
          item={receiptItem}
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
        />
      </CeremonyShell>
    </LazyMotion>
  );
}
