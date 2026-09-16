"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { copy } from "@/lib/copy/phygital";
import { announceClaimedSuccess } from "@/lib/wallet/announce-claimed-success";
import { setPendingReturn } from "@/lib/wallet/claim-return";
import {
  walletClaimHref,
  walletHref,
  walletSettingsHref,
} from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * Canonical `set_authority` ceremony — Hold to claim.
 * All claim entry points navigate here via {@link walletClaimHref}.
 */
export function ClaimAccessoryPanel({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { isSignedIn, isClaimed, isLoading } = useTokenOwner(phygitalTokenPda);
  const claim = useClaimAccessory(phygitalTokenPda);

  useEffect(() => {
    if (!isLoading && isClaimed) {
      router.replace(walletHref(phygitalTokenPda));
    }
  }, [isClaimed, isLoading, phygitalTokenPda, router]);

  function goSignIn() {
    setPendingReturn(walletClaimHref(phygitalTokenPda));
    router.push("/");
  }

  function onClaimed() {
    announceClaimedSuccess({
      onLimitSpend: () =>
        router.push(walletSettingsHref(phygitalTokenPda, "walletPolicy")),
    });
    router.replace(walletHref(phygitalTokenPda));
  }

  if (isLoading || isClaimed) {
    return (
      <CeremonyShell>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <p className="text-sm text-muted-foreground" role="status">
            {copy.wallet.authorityChecking}
          </p>
        </div>
      </CeremonyShell>
    );
  }

  const icon = <RevibaseMark className="size-5 text-muted-foreground" />;

  if (!isSignedIn) {
    return (
      <CeremonyShell>
        <GateMessage
          icon={icon}
          title={copy.wallet.authoritySignInTitle}
          body={copy.wallet.authoritySignInBody}
          action={
            <div className="flex flex-col gap-2.5">
              <Button
                type="button"
                size="lg"
                className="w-full rounded-full"
                onClick={goSignIn}
              >
                {copy.wallet.authoritySignInCta}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="w-full rounded-full"
                onClick={onBack}
              >
                {copy.common.cancel}
              </Button>
            </div>
          }
        />
      </CeremonyShell>
    );
  }

  const holding = claim.isPending;

  return (
    <CeremonyShell>
      <NfcHoldStatus
        size="lg"
        pulsing={holding}
        busy={holding}
        progress={holding}
        title={
          holding
            ? copy.wallet.holdCeremonyTitle
            : copy.wallet.authorityClaimTitle
        }
        body={
          holding
            ? copy.wallet.holdCeremonyBody
            : copy.wallet.authorityClaimHoldBody
        }
        action={
          holding ? undefined : (
            <div className="flex flex-col gap-2.5">
              <Button
                type="button"
                size="lg"
                className="w-full rounded-full"
                onClick={() =>
                  claim.mutate(undefined, {
                    onSuccess: onClaimed,
                    onError: (err) =>
                      toast.error(
                        toUserErrorMessage(
                          err,
                          copy.wallet.authorityClaimFailed,
                        ),
                      ),
                  })
                }
              >
                {copy.wallet.authorityClaimCta}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="w-full rounded-full"
                onClick={onBack}
              >
                {copy.wallet.authorityBrowse}
              </Button>
            </div>
          )
        }
      />
    </CeremonyShell>
  );
}
