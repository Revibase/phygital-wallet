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
import { useAccessoryHoldLabel } from "@/hooks/token/use-accessory-hold-label";
import { copy } from "@/lib/copy/phygital";
import { tryParseRouteAddress } from "@/lib/solana/address";
import { tokenHref } from "@/lib/wallet/token-routes";

/**
 * Hold ceremony when middleware redirects here — no browse-unlock cookie for
 * this URL yet (often because another accessory is still unlocked).
 *
 * Screen intent = URL accessory. On a valid tap of a different item, offer
 * clear recovery: retry the expected chip, or open the one just held.
 */
export default function TokenUnlockPage() {
  const router = useRouter();
  const params = useParams();
  const address = tryParseRouteAddress(params, "address");
  const expectedPda = address ? String(address) : null;
  const accessory = useAccessoryHold();
  const expected = useAccessoryHoldLabel(expectedPda);
  const held = useAccessoryHoldLabel(
    accessory.mismatch?.heldPhygitalToken ?? null,
  );

  async function holdToOpen() {
    if (!expectedPda) return;
    const connection = await accessory.hold({
      expectedPhygitalToken: expectedPda,
    });
    if (!connection) return;
    router.replace(tokenHref(connection.phygitalToken));
  }

  function openHeldInstead() {
    const heldPda = accessory.mismatch?.heldPhygitalToken;
    if (!heldPda) return;
    accessory.clearMismatch();
    // Cookie already issued for the held accessory during the mismatched tap.
    router.replace(tokenHref(heldPda));
  }

  if (!address || !expectedPda) {
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

  if (accessory.mismatch) {
    return (
      <TokenRouteShell layout="compact">
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing={false}
            busy={false}
            imageSrc={expected.imageSrc}
            imageAlt={expected.name}
            title={copy.wallet.holdMismatchTitle}
            body={copy.wallet.holdMismatchBody(expected.name)}
            action={
              <div className="flex w-full flex-col gap-2.5">
                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-full"
                  disabled={accessory.holding}
                  onClick={() => void holdToOpen()}
                >
                  {copy.wallet.holdMismatchRetry(expected.name)}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  className="w-full rounded-full"
                  disabled={accessory.holding}
                  onClick={openHeldInstead}
                >
                  {copy.wallet.holdMismatchOpenHeld(held.name)}
                </Button>
              </div>
            }
          />
        </CeremonyShell>
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
          imageSrc={expected.imageSrc}
          imageAlt={expected.name}
          title={
            accessory.error ? copy.verify.failed : copy.wallet.holdToOpenTitle
          }
          body={
            accessory.error ??
            copy.wallet.holdToOpenBodyNamed(expected.name)
          }
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
