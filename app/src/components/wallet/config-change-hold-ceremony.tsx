"use client";

import type { ReactNode } from "react";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";

export type ConfigChangeCeremonyPhase = "holding" | "success";

/**
 * Shared hold-to-authenticate → success ceremony for config changes. The owner
 * has already approved the grant in the approval sheet; this covers only the
 * accessory tap (Secp256r1) that produces the on-chain proof, then success.
 */
export function ConfigChangeHoldCeremony({
  phase,
  holdPending = false,
  onLeadingClick,
  leadingLabel,
  onHold,
  successBody,
  successAction,
}: {
  phase: ConfigChangeCeremonyPhase;
  /** True while the accessory tap (Secp256r1) is in progress. */
  holdPending?: boolean;
  onLeadingClick: () => void;
  leadingLabel: string;
  /** User-gesture handler for the accessory tap (Secp256r1). */
  onHold?: () => void;
  successBody?: string;
  successAction?: ReactNode;
}) {
  const holding = phase === "holding";
  const success = phase === "success";

  const title = success ? copy.common.done : copy.wallet.holdToSave;
  const body = success ? successBody : copy.wallet.configChangeHoldBody;

  const action = success ? (
    successAction
  ) : holding && onHold && !holdPending ? (
    <Button type="button" size="lg" className="w-full" onClick={onHold}>
      {copy.wallet.holdToSave}
    </Button>
  ) : undefined;

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
        pulsing={holding && holdPending}
        busy={holdPending}
        tone={success ? "success" : "default"}
        title={title}
        body={body}
        action={action}
      />
    </CeremonyShell>
  );
}
