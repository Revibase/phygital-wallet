"use client";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { Button } from "@/components/ui/button";
import { OwnerConnectButton } from "@/components/wallet/owner-connect-button";
import { useTapToOpen } from "@/hooks/token/use-tap-to-open";
import { copy } from "@/lib/copy/phygital";

/**
 * Signed-out home: continue into secure setup / unlock (primary), or open
 * an accessory you're holding by tapping it (secondary).
 */
export function OwnerWelcome() {
  const tap = useTapToOpen();

  if (tap.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  return (
    <CeremonyShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
        <RevibaseMark variant="digital" className="size-12" aria-hidden />
        <div className="max-w-xs space-y-2">
          <h1 className="text-display-md tracking-tight">
            {copy.home.welcomeTitle}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy.home.welcomeBody}
          </p>
        </div>
        <div className="flex w-full max-w-72 flex-col gap-2.5">
          <OwnerConnectButton
            className="w-full rounded-full"
            signInLabel={copy.home.welcomeSignIn}
          />
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full rounded-full"
            disabled={tap.holding}
            onClick={() => void tap.open()}
          >
            {tap.holding
              ? copy.verify.holdStill
              : copy.home.welcomeHaveAccessory}
          </Button>
          {tap.error ? (
            <p className="text-xs text-destructive">{tap.error}</p>
          ) : null}
        </div>
      </div>
    </CeremonyShell>
  );
}
