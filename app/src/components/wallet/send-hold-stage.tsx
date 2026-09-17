"use client";

import { useState } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";

import { NavBar } from "@/components/shared/nav-bar";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { CollectibleOrb } from "@/components/token/collectible-orb";
import { ActivityReceiptSheet } from "@/components/wallet/activity-receipt-sheet";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { copyBlockClass } from "@/lib/layout";
import { snapEnter, snapEnterTransition } from "@/lib/motion";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";
import {
  walletSignPhaseCopy,
  type PhygitalWalletSignPhase,
} from "@/lib/wallet/sign-phase-copy";
import { cn } from "@/lib/utils";

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

/** Parent send page ceremony — one state instead of hold + sign + recap. */
export type SendCeremonyState =
  | { stage: "idle" }
  | {
      stage: "holding";
      signPhase: PhygitalWalletSignPhase | null;
      recap: SendHoldRecap;
    }
  | { stage: "success"; recap: SendHoldRecap };

function SendRecapCard({ recap }: { recap: SendHoldRecap }) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-muted/25 px-4 py-3 text-center">
      <p className="font-(family-name:--font-display) text-lg">
        {recap.amountLabel}
      </p>
      <p className="text-xs text-muted-foreground">
        {copy.wallet.to} {recap.recipientLabel}
      </p>
      {recap.feeLabel ? (
        <p className="mt-1 text-xs text-muted-foreground">{recap.feeLabel}</p>
      ) : null}
    </div>
  );
}

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
          phase === "success" ? undefined : (
            <NavBar
              leading={
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  {copy.common.cancel}
                </Button>
              }
            />
          )
        }
      >
        {/*
          Top-half layout: amount/destination stay visible above the native
          passkey sheet that covers the bottom half of the screen.
        */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "flex flex-col items-center gap-4 px-4 pt-2",
              phase === "holding" ? "max-h-[48vh] justify-start" : "flex-1 justify-center py-8",
            )}
          >
            {recap ? <SendRecapCard recap={recap} /> : null}

            <CollectibleOrb
              src={recap?.imageSrc ?? imageSrc}
              alt=""
              size="lg"
              pulsing={phase === "holding" && holdingCopy.pulse}
              busy={phase === "holding" && !holdingCopy.pulse}
              tone={phase === "success" ? "success" : "default"}
              progress={phase === "holding"}
            />

            <div className={cn(copyBlockClass, "space-y-1.5 text-center")}>
              <p className="text-display-md tracking-tight text-foreground md:text-2xl">
                {phase === "success" ? copy.wallet.sent : holdingCopy.title}
              </p>
              {phase === "holding" && holdingCopy.body ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {holdingCopy.body}
                </p>
              ) : null}
            </div>

            {phase === "success" ? (
              <m.div
                className="flex w-full max-w-sm flex-col gap-2"
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
