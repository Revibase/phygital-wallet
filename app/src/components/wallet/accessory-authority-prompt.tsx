"use client";

import { useState, type ReactNode } from "react";
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
import { announceClaimedSuccess } from "@/lib/wallet/announce-claimed-success";
import { walletSettingsHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * After browse-unlock, if this accessory has no on-chain authority, prompt the
 * user to become it. Unsigned users sign in / create an account first (sheet →
 * signer iframe). Claim uses the same Hold ceremony as open/send — accessory
 * NFC, not Face ID. Dismissible so balances can still be browsed; permissions
 * stay locked until claimed. Success lands quietly — no blocking dialog.
 */
export function AccessoryAuthorityPrompt({
  phygitalTokenPda,
  children,
}: {
  phygitalTokenPda: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isClaimed, isLoading, isSignedIn } = useTokenOwner(phygitalTokenPda);
  const { login, isLoading: ownerLoading } = useOwnerWallet();
  const claim = useClaimAccessory(phygitalTokenPda);
  const [dismissed, setDismissed] = useState(false);

  function onClaimed() {
    setDismissed(true);
    announceClaimedSuccess({
      onLimitSpend: () =>
        router.push(walletSettingsHref(phygitalTokenPda, "walletPolicy")),
    });
  }

  if (isClaimed || dismissed) {
    return <>{children}</>;
  }

  if (isLoading) {
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

  const holding = claim.isPending;

  return (
    <CeremonyShell
      leading={
        holding ? undefined : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setDismissed(true)}
          >
            {copy.wallet.authorityBrowse}
          </Button>
        )
      }
    >
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
            : copy.wallet.authorityClaimBody
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
                      toUserErrorMessage(err, copy.wallet.authorityClaimFailed),
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
