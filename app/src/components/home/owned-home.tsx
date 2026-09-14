"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/app-shell";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { tokenHref } from "@/lib/wallet/token-routes";

/** Home entry: authenticate an accessory locally, then open its token page. */
export function OwnedHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessory = useAccessoryHold();

  async function holdToOpen() {
    const connection = await accessory.hold();
    if (connection) {
      queryClient.setQueryData(queryKeys.browseUnlock.byToken(connection.phygitalToken), true);
      router.push(tokenHref(connection.phygitalToken));
    }
  }

  return (
    <AppShell layout="home">
      {accessory.showInAppGate ? (
        <InAppBrowserGate body={copy.gate.openInBrowserBody} />
      ) : (
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing={accessory.holding}
            busy={accessory.holding}
            progress={accessory.holding}
            title={copy.wallet.holdToOpenTitle}
            body={accessory.error ?? copy.home.emptyBody}
            action={
              <Button type="button" size="lg" className="w-full rounded-full" disabled={accessory.holding} onClick={() => void holdToOpen()}>
                {accessory.error ? copy.common.tryAgain : copy.wallet.holdToOpenCta}
              </Button>
            }
          />
        </CeremonyShell>
      )}
    </AppShell>
  );
}
