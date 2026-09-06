"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";

import { CollectibleMetadataRow } from "@/components/token/collectible-metadata-group";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";

/** Verification metadata row — Verify CTA, or authenticity seal after live auth. */
export function VerificationMetadataRow({
  liveConfirmed,
  onVerify,
}: {
  liveConfirmed: boolean;
  /** Runs hold-to-verify (first check or recheck). */
  onVerify?: () => void;
}) {
  if (liveConfirmed) {
    const canRecheck = Boolean(onVerify);
    return (
      <CollectibleMetadataRow
        label={copy.token.verification}
        onPress={canRecheck ? onVerify : undefined}
        trailing={
          canRecheck ? (
            <RefreshCw className="size-3.5 text-muted-foreground" aria-hidden />
          ) : undefined
        }
        subtitle={
          canRecheck ? (
            <>
              <span className="font-medium text-foreground/80">
                {copy.verify.verifyAgain}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {copy.verify.verifyAgainHint}
              </span>
            </>
          ) : undefined
        }
      >
        <StatusPill
          label={copy.verify.verified}
          tone="success"
          sealed
          aria-label={
            canRecheck ? copy.verify.verifiedRecheckAria : copy.verify.verified
          }
        />
      </CollectibleMetadataRow>
    );
  }

  return (
    <CollectibleMetadataRow label={copy.token.verification}>
      {onVerify ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 rounded-full px-3.5 text-xs font-medium"
          onClick={onVerify}
        >
          {copy.verify.verifyCta}
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
          <CheckCircle2 className="size-3.5 opacity-40" aria-hidden />
          {copy.verify.notVerified}
        </span>
      )}
    </CollectibleMetadataRow>
  );
}
