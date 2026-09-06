"use client";

import type { ReactNode } from "react";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { StageTransition } from "@/components/shared/stage-transition";
import { Button } from "@/components/ui/button";
import { useHoldToCheck } from "@/hooks/token/use-hold-to-check";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { copy } from "@/lib/copy/phygital";
import {
  tokenHasLinkedMint,
  type PhygitalToken,
} from "@/lib/phygital/token";

/** Verify session for minted/unminted homes — Hold to Check. */
export function useTokenVerifySession(token: PhygitalToken) {
  const hold = useHoldToCheck(token);
  return {
    token,
    liveConfirmed: hold.liveConfirmed,
    overlay: hold.overlay,
    holdError: hold.holdError,
    showInAppGate: hold.showInAppGate,
    holdToCheck: hold.holdToCheck,
  };
}

export type TokenVerifySession = ReturnType<typeof useTokenVerifySession>;

function VerifyFailedCeremony({
  token,
  errorMessage,
  onRetry,
}: {
  token: PhygitalToken;
  errorMessage: string;
  onRetry: () => void;
}) {
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);

  return (
    <CeremonyShell>
      <NfcHoldStatus
        size="lg"
        pulsing={false}
        title={copy.verify.failed}
        body={errorMessage}
        imageSrc={collectible?.image}
        imageAlt={collectible?.name ?? ""}
        action={
          <Button type="button" size="lg" className="w-full" onClick={onRetry}>
            {copy.common.tryAgain}
          </Button>
        }
      />
    </CeremonyShell>
  );
}

export function TokenVerifySessionGate({
  session,
  inAppBody,
  children,
}: {
  session: TokenVerifySession;
  inAppBody: string;
  children: ReactNode;
}) {
  if (session.showInAppGate) {
    return <InAppBrowserGate body={inAppBody} />;
  }

  const overlay = session.overlay;
  const showOverlay =
    overlay === "pending" ||
    overlay === "recheck-success" ||
    overlay === "failed";

  return (
    <StageTransition stageKey={showOverlay ? `overlay-${overlay}` : "home"}>
      {overlay === "pending" ? (
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing
            busy
            title={copy.verify.holdStill}
            body={copy.verify.holdStillBody}
          />
        </CeremonyShell>
      ) : overlay === "recheck-success" ? (
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing={false}
            tone="success"
            title={copy.verify.verified}
            body={copy.verify.verifiedAgainBody}
          />
        </CeremonyShell>
      ) : overlay === "failed" ? (
        <VerifyFailedCeremony
          token={session.token}
          errorMessage={session.holdError ?? copy.verify.failedBody}
          onRetry={() => void session.holdToCheck()}
        />
      ) : (
        children
      )}
    </StageTransition>
  );
}
