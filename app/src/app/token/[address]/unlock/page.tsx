"use client";

import { useParams, useRouter } from "next/navigation";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import { Button } from "@/components/ui/button";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { copy } from "@/lib/copy/phygital";
import { tryParseRouteAddress } from "@/lib/solana/address";
import { tokenHref } from "@/lib/wallet/token-routes";

/**
 * Hold ceremony when middleware redirects here — no browse-unlock cookie yet.
 * On success the API sets the cookie; navigate into the gated token tree.
 */
export default function TokenUnlockPage() {
  const router = useRouter();
  const params = useParams();
  const address = tryParseRouteAddress(params, "address");
  const accessory = useAccessoryHold();

  async function holdToOpen() {
    if (!address) return;
    const connection = await accessory.hold({
      expectedPhygitalToken: String(address),
    });
    if (!connection) return;
    // Full navigation so middleware sees the new Set-Cookie.
    router.replace(tokenHref(String(address)));
  }

  if (!address) {
    return (
      <TokenRouteShell layout="compact">
        <GateMessage
          icon={<RevibaseMark className="size-5 text-muted-foreground" />}
          title={copy.token.itemLoadFailed}
          body={copy.token.itemNotOnChain}
        />
      </TokenRouteShell>
    );
  }

  if (accessory.showInAppGate) {
    return (
      <TokenRouteShell layout="compact">
        <InAppBrowserGate body={copy.gate.openInBrowserBody} />
      </TokenRouteShell>
    );
  }

  return (
    <TokenRouteShell layout="compact">
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing={accessory.holding || !accessory.error}
          busy={accessory.holding}
          progress={accessory.holding}
          title={
            accessory.error ? copy.verify.failed : copy.wallet.holdToOpenTitle
          }
          body={accessory.error ?? copy.wallet.holdCeremonyBody}
          action={
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={accessory.holding}
              onClick={() => void holdToOpen()}
            >
              {accessory.error
                ? copy.common.tryAgain
                : copy.wallet.holdToOpenCta}
            </Button>
          }
        />
      </CeremonyShell>
    </TokenRouteShell>
  );
}
