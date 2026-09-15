"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { ClaimedSuccessDialog } from "@/components/wallet/claimed-success-dialog";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * After browse-unlock, if this accessory has no on-chain authority, prompt the
 * user to become it. Unsigned users sign in / create an account first.
 * Dismissible so balances can still be browsed; permissions stay locked until claimed.
 */
export function AccessoryAuthorityPrompt({
  phygitalTokenPda,
  children,
}: {
  phygitalTokenPda: string;
  children: ReactNode;
}) {
  const { isClaimed, isLoading, isSignedIn } = useTokenOwner(phygitalTokenPda);
  const { login, isLoading: ownerLoading } = useOwnerWallet();
  const claim = useClaimAccessory(phygitalTokenPda);
  const [dismissed, setDismissed] = useState(false);
  const [claimedOpen, setClaimedOpen] = useState(false);

  if (isClaimed || dismissed) {
    return (
      <>
        {children}
        <ClaimedSuccessDialog
          open={claimedOpen}
          onOpenChange={setClaimedOpen}
          phygitalTokenPda={phygitalTokenPda}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing
          busy
          title={copy.wallet.authorityChecking}
        />
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
                disabled={ownerLoading}
                onClick={() =>
                  void login().catch((err) =>
                    toast.error(
                      toUserErrorMessage(err, errorCopy.signerFailed.body),
                    ),
                  )
                }
              >
                {copy.wallet.authoritySignInCta}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                className="w-full rounded-full"
                onClick={() => setDismissed(true)}
              >
                {copy.wallet.authorityBrowse}
              </Button>
            </div>
          }
        />
      </CeremonyShell>
    );
  }

  return (
    <CeremonyShell>
      <GateMessage
        icon={icon}
        title={copy.wallet.authorityClaimTitle}
        body={copy.wallet.authorityClaimBody}
        action={
          <div className="flex flex-col gap-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={claim.isPending}
              onClick={() =>
                claim.mutate(undefined, {
                  onSuccess: () => setClaimedOpen(true),
                  onError: (err) =>
                    toast.error(
                      toUserErrorMessage(err, copy.wallet.authorityClaimFailed),
                    ),
                })
              }
            >
              {claim.isPending
                ? copy.wallet.authorityClaiming
                : copy.wallet.authorityClaimCta}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              className="w-full rounded-full"
              disabled={claim.isPending}
              onClick={() => setDismissed(true)}
            >
              {copy.wallet.authorityBrowse}
            </Button>
          </div>
        }
      />
      <ClaimedSuccessDialog
        open={claimedOpen}
        onOpenChange={setClaimedOpen}
        phygitalTokenPda={phygitalTokenPda}
      />
    </CeremonyShell>
  );
}
