"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { findPhygitalTokenPda } from "phygital-token-sdk";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { usePhygitalToken } from "@/hooks/token/use-phygital-token";
import { useTapVerify } from "@/hooks/token/use-tap-verify";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { storeAccessoryProof, storePossessionToken } from "@/lib/wallet/device-auth-client";
import { tokenHomeHref } from "@/lib/wallet/token-home-href";

export type TokenNfcCopy = {
  inAppCheck: string;
  holdBody: string;
};

/**
 * Cold `/token` — luminous boot on NFC tap, or Hold ceremony.
 */
export function TokenNfcApp({ nfcCopy }: { nfcCopy: TokenNfcCopy }) {
  const router = useRouter();
  const { hasTapProof, verify, verifyPending, result, verifyError } =
    useTapVerify();
  const accessory = useAccessoryHold();
  const [holdError, setHoldError] = useState<string | null>(null);

  // Tap URL `pk` is the chip identifier — resolve PDA via GPA, not findPda(pk).
  const identifier =
    hasTapProof && verify === "verified" ? (result?.identifier ?? null) : null;
  const tokenQuery = usePhygitalToken(identifier);

  useEffect(() => {
    if (!tokenQuery.data) return;
    const pda = String(tokenQuery.data.address);
    if (result?.possessionToken) {
      storePossessionToken(pda, result.possessionToken);
    }
    router.replace(tokenHomeHref(pda));
  }, [tokenQuery.data, result?.possessionToken, router]);

  async function holdToOpen() {
    setHoldError(null);
    const auth = await accessory.hold();
    if (!auth) return;
    try {
      const pda = String(await findPhygitalTokenPda(auth.secp256r1PublicKey));
      // Reuse this Hold for browse + link (same role as NFC possessionToken).
      storeAccessoryProof(pda, {
        message: auth.message,
        response: auth.response,
      });
      router.replace(tokenHomeHref(pda));
    } catch (e) {
      setHoldError(toUserErrorMessage(e));
    }
  }

  if (accessory.showInAppGate) {
    return <InAppBrowserGate body={nfcCopy.inAppCheck} />;
  }

  if (
    hasTapProof &&
    !tokenQuery.isError &&
    (verifyPending || verify === "pending" || verify === "verified")
  ) {
    const authentic = verify === "verified";
    return (
      <NfcHoldStatus
        size="lg"
        pulsing
        busy={!authentic}
        progress={!authentic}
        tone={authentic ? "success" : "default"}
        title={
          authentic
            ? copy.wallet.statusAuthentic
            : copy.wallet.confirmingAuthenticity
        }
        body={
          authentic ? undefined : copy.wallet.readingAccessory
        }
        header={
          authentic ? (
            <div className="flex justify-center">
              <StatusPill
                label={copy.wallet.statusAuthenticLive}
                tone="success"
                sealed
              />
            </div>
          ) : null
        }
      />
    );
  }

  if (accessory.holding) {
    return (
      <NfcHoldStatus
        size="lg"
        pulsing
        busy
        progress
        title={copy.wallet.holdCeremonyTitle}
        body={copy.wallet.holdCeremonyBody}
      />
    );
  }

  const error =
    accessory.error ??
    holdError ??
    (tokenQuery.error ? toUserErrorMessage(tokenQuery.error) : null) ??
    (hasTapProof && verify === "failed"
      ? toUserErrorMessage(verifyError)
      : null);

  return (
    <NfcHoldStatus
      size="lg"
      pulsing={!error}
      title={error ? copy.verify.failed : copy.wallet.holdToOpenTitle}
      body={error ?? nfcCopy.holdBody}
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
  );
}
