"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { Button } from "@/components/ui/button";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { copy } from "@/lib/copy/phygital";
import { setPendingReturn } from "@/lib/wallet/claim-return";
import { walletClaimHref } from "@/lib/wallet/token-routes";

/**
 * After browse-unlock, if this accessory has no on-chain authority, nudge the
 * user toward the canonical claim route (`/wallet/claim`).
 *
 * Does not run `set_authority` itself. Skips the gate on the claim path so
 * that ceremony is reachable.
 */
export function AccessoryAuthorityPrompt({
  phygitalTokenPda,
  children,
}: {
  phygitalTokenPda: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isClaimed, isLoading, isSignedIn } = useTokenOwner(phygitalTokenPda);
  const [dismissed, setDismissed] = useState(false);

  const onClaimRoute = /\/wallet\/claim(?:\/|$)/.test(pathname);

  function goClaim() {
    if (!isSignedIn) {
      setPendingReturn(walletClaimHref(phygitalTokenPda));
      router.push("/");
      return;
    }
    router.push(walletClaimHref(phygitalTokenPda));
  }

  if (isClaimed || dismissed || onClaimRoute) {
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

  return (
    <CeremonyShell>
      <GateMessage
        icon={icon}
        title={copy.wallet.authoritySignInTitle}
        body={
          isSignedIn
            ? copy.wallet.authorityClaimBody
            : copy.wallet.authoritySignInBody
        }
        action={
          <div className="flex flex-col gap-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              onClick={goClaim}
            >
              {isSignedIn
                ? copy.wallet.unclaimedBannerAction
                : copy.wallet.authoritySignInCta}
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
