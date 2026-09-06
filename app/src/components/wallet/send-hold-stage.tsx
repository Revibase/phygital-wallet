"use client";

import { useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";

import { NavBar } from "@/components/shared/nav-bar";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { ActivityReceiptSheet } from "@/components/wallet/activity-receipt-sheet";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { snapEnter, snapEnterTransition } from "@/lib/motion";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";

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
};

export function SendHoldStage({
  phase,
  imageSrc,
  recap,
  onClose,
}: {
  phase: "holding" | "success";
  imageSrc?: string | null;
  recap?: SendHoldRecap | null;
  onClose: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const enter = snapEnter(prefersReducedMotion);
  const [receiptOpen, setReceiptOpen] = useState(false);

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
      <div className="flex flex-1 flex-col">
        <NavBar
          leading={
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {copy.common.cancel}
            </Button>
          }
        />
        <AnimatePresence mode="sync" initial={false}>
          <m.div
            key={phase}
            initial={enter.initial}
            animate={enter.animate}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={snapEnterTransition}
            className="flex flex-1 flex-col"
          >
            <NfcHoldStatus
              size="lg"
              pulsing={phase === "holding"}
              busy={phase === "holding"}
              progress={phase === "holding"}
              tone={phase === "success" ? "success" : "default"}
              imageSrc={imageSrc}
              title={
                phase === "success"
                  ? copy.wallet.sent
                  : copy.wallet.holdCeremonyTitle
              }
              body={
                phase === "success"
                  ? undefined
                  : copy.wallet.holdCeremonyBody
              }
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
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
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
                      <Button type="button" size="lg" className="w-full" onClick={onClose}>
                        {copy.common.done}
                      </Button>
                    </m.div>
                  ) : null}
                </div>
              }
            />
          </m.div>
        </AnimatePresence>
        <ActivityReceiptSheet
          item={receiptItem}
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
        />
      </div>
    </LazyMotion>
  );
}
