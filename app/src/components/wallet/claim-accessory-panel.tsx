"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { walletHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * Canonical `set_authority` ceremony — sign in (if needed) then Hold to claim.
 * First-run lands here after unlock; no browse-unclaimed side path.
 */
export function ClaimAccessoryPanel({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const router = useRouter();
  const { isSignedIn, isClaimed, isLoading } = useTokenOwner(phygitalTokenPda);
  const { login, isLoading: ownerLoading } = useOwnerWallet();
  const claim = useClaimAccessory(phygitalTokenPda);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!isLoading && isClaimed) {
      router.replace(walletHref(phygitalTokenPda));
    }
  }, [isClaimed, isLoading, phygitalTokenPda, router]);

  async function onSignIn() {
    setSigningIn(true);
    try {
      await login();
    } catch (err) {
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
    } finally {
      setSigningIn(false);
    }
  }

  function onClaimed() {
    router.replace(walletHref(phygitalTokenPda));
  }

  function leaveToken() {
    router.push("/");
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
  const busySignIn = signingIn || ownerLoading;

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
                disabled={busySignIn}
                onClick={() => void onSignIn()}
              >
                {copy.wallet.authoritySignInCta}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="w-full rounded-full"
                disabled={busySignIn}
                onClick={leaveToken}
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
          )
        }
      />
    </CeremonyShell>
  );
}
