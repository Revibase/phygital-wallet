"use client";

import type { ReactNode } from "react";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";

export type ConfigChangeCeremonyPhase = "holding" | "confirming" | "success";

/** Shared hold → optional phone confirm CTA → success for config changes. */
export function ConfigChangeHoldCeremony({
  phase,
  needsPhoneConfirm,
  confirmPending = false,
  onLeadingClick,
  leadingLabel,
  onConfirmPhone,
  successBody,
  successAction,
}: {
  phase: ConfigChangeCeremonyPhase;
  /** True when Config default verifier needs a manual phone passkey step. */
  needsPhoneConfirm: boolean;
  /** True while waiting for the platform WebAuthn prompt after CTA. */
  confirmPending?: boolean;
  onLeadingClick: () => void;
  leadingLabel: string;
  /** User-gesture handler — starts platform WebAuthn + send. */
  onConfirmPhone?: () => void;
  successBody?: string;
  successAction?: ReactNode;
}) {
  const confirming = phase === "confirming";
  const success = phase === "success";

  const title = success
    ? copy.common.done
    : confirming
      ? copy.wallet.configChangeConfirmTitle
      : copy.wallet.holdToSave;

  const body = success
    ? successBody
    : confirming
      ? confirmPending
        ? copy.wallet.configChangeConfirmPending
        : copy.wallet.configChangeConfirmBody
      : needsPhoneConfirm
        ? copy.wallet.configChangeHoldBody
        : copy.wallet.holdCeremonyBody;

  const action = success
    ? successAction
    : confirming && onConfirmPhone && !confirmPending
      ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={onConfirmPhone}
          >
            {copy.wallet.configChangeConfirmCta}
          </Button>
        )
      : undefined;

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
        busy={phase === "holding" || confirmPending}
        tone={success ? "success" : "default"}
        title={title}
        body={body}
        action={action}
      />
    </CeremonyShell>
  );
}
