"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { TAP_ERROR_COOKIE } from "@/lib/wallet/tap-error-cookie";
import { tokenHref } from "@/lib/wallet/token-routes";

function consumeTapErrorCookie(): boolean {
  if (typeof document === "undefined") return false;
  const found = document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${TAP_ERROR_COOKIE}=`));
  if (!found) return false;
  document.cookie = `${TAP_ERROR_COOKIE}=; Max-Age=0; path=/`;
  return true;
}

/**
 * Cold `/token` — Hold ceremony.
 * NFC dynamic-URL taps (`?pk&s&c&n`) are handled in middleware (cookie + redirect).
 */
export function TokenNfcApp() {
  const router = useRouter();
  const accessory = useAccessoryHold();
  const [holdError, setHoldError] = useState<string | null>(null);
  const [tapError, setTapError] = useState(false);

  useEffect(() => {
    if (consumeTapErrorCookie()) setTapError(true);
  }, []);

  async function holdToOpen() {
    setHoldError(null);
    setTapError(false);
    const connection = await accessory.hold();
    if (!connection) return;
    try {
      router.replace(tokenHref(connection.phygitalToken));
    } catch (e) {
      setHoldError(toUserErrorMessage(e));
    }
  }

  if (accessory.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  if (accessory.holding) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing
          busy
          progress
          title={copy.wallet.holdCeremonyTitle}
          body={copy.wallet.holdCeremonyBody}
        />
      </CeremonyShell>
    );
  }

  const error =
    accessory.error ??
    holdError ??
    (tapError ? copy.verify.failedBody : null);

  return (
    <CeremonyShell>
      <NfcHoldStatus
        size="lg"
        pulsing={!error}
        title={error ? copy.verify.failed : copy.wallet.holdToOpenTitle}
        body={error ?? copy.wallet.holdToOpenBody}
        action={
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            onClick={() => void holdToOpen()}
          >
            {error ? copy.common.tryAgain : copy.wallet.holdToOpenCta}
          </Button>
        }
      />
    </CeremonyShell>
  );
}
