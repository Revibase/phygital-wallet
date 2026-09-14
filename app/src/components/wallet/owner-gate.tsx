"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { OwnerConnectButton } from "@/components/wallet/owner-connect-button";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { toUserErrorMessage } from "@/lib/user-errors";

/**
 * Owner-only gate: renders `children` only when the signed-in Helius WaaS wallet
 * is this accessory's on-chain authority. Non-owners get an inline prompt to
 * sign in, claim (if unclaimed), or switch wallets — no redirect.
 */
export function OwnerGate({
  phygitalTokenPda,
  children,
}: {
  phygitalTokenPda: string;
  children: ReactNode;
}) {
  const { isOwner, isLoading, isSignedIn, isClaimed } =
    useTokenOwner(phygitalTokenPda);
  const claim = useClaimAccessory(phygitalTokenPda);

  if (isOwner) return <>{children}</>;

  if (isLoading) {
    return (
      <CeremonyShell>
        <NfcHoldStatus size="lg" pulsing busy title="Checking ownership…" />
      </CeremonyShell>
    );
  }

  const icon = <RevibaseMark className="size-5 text-muted-foreground" />;

  if (!isSignedIn) {
    return (
      <GateMessage
        icon={icon}
        title="Owner sign-in required"
        body="Sign in to manage this item’s settings."
        action={<OwnerConnectButton className="w-full" />}
      />
    );
  }

  if (!isClaimed) {
    return (
      <GateMessage
        icon={icon}
        title="Claim this item"
        body="Tap your accessory to set this wallet as the owner."
        action={
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={claim.isPending}
            onClick={() =>
              claim.mutate(undefined, {
                onSuccess: () => toast.success("Item claimed"),
                onError: (err) =>
                  toast.error(
                    toUserErrorMessage(err, "Couldn’t claim this item")
                  ),
              })
            }
          >
            {claim.isPending ? "Claiming…" : "Claim this item"}
          </Button>
        }
      />
    );
  }

  return (
    <GateMessage
      icon={icon}
      destructive
      title="Not your item"
      body="This item is owned by a different wallet. Switch to the owner wallet to manage it."
      action={<OwnerConnectButton className="w-full" />}
    />
  );
}
