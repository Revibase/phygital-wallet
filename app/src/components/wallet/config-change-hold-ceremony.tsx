"use client";

import type { ReactNode } from "react";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";

/** Shared hold / success frame for token verifier + recovery config changes. */
export function ConfigChangeHoldCeremony({
  phase,
  needsPhoneConfirm,
  onLeadingClick,
  leadingLabel,
  successBody,
  successAction,
}: {
  phase: "holding" | "success";
  needsPhoneConfirm: boolean;
  onLeadingClick: () => void;
  leadingLabel: string;
  successBody?: string;
  successAction?: ReactNode;
}) {
  return (
    <CeremonyShell
      leading={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={onLeadingClick}
        >
          {leadingLabel}
        </Button>
      }
    >
      <NfcHoldStatus
        size="lg"
        pulsing={phase === "holding"}
        busy={phase === "holding"}
        tone={phase === "success" ? "success" : "default"}
        title={phase === "success" ? copy.common.done : copy.wallet.holdToSave}
        body={
          phase === "success"
            ? successBody
            : needsPhoneConfirm
              ? copy.wallet.configChangeHoldBody
              : copy.wallet.holdCeremonyBody
        }
        action={phase === "success" ? successAction : undefined}
      />
    </CeremonyShell>
  );
}
