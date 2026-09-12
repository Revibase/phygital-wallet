"use client";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { redirectToClaimSetup } from "@/lib/wallet/claim-setup-href";
import {
  redirectToDeviceSignIn,
  type PolicySetupScreen,
} from "@/lib/wallet/device-sign-in-href";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import { walletSettingsHref } from "@/lib/wallet/token-routes";

/** Calm sheet when Limits need claim, sign-in, or are linked elsewhere. */
export function LimitsSetupSheet({
  phygitalTokenPda,
  linkStatus,
  claimed,
  screen,
  onBack,
  onClaim,
}: {
  phygitalTokenPda: string;
  linkStatus?: LinkStatus;
  claimed?: boolean;
  screen: PolicySetupScreen;
  onBack: () => void;
  /** Prefer in-wallet claim when browse unlock is already fresh. */
  onClaim?: () => void;
}) {
  const linkedElsewhere = linkStatus === "linked_elsewhere";
  /** Claimed but this phone isn’t owner — returning owner / quiet path. */
  const needsSignIn = claimed === true && !linkedElsewhere;
  const showClaim = !linkedElsewhere && !needsSignIn;
  const returnTo = walletSettingsHref(phygitalTokenPda, screen);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={
          linkedElsewhere
            ? copy.wallet.limitsLinkedElsewhereTitle
            : needsSignIn
            ? copy.wallet.claimSignInTitle
            : copy.wallet.claimTitle
        }
      />
      <p className="text-sm text-muted-foreground">
        {linkedElsewhere
          ? copy.wallet.limitsLinkedElsewhereBody
          : needsSignIn
          ? copy.wallet.claimSignInBody
          : copy.wallet.claimBody}
      </p>
      {linkedElsewhere ? (
        <Button type="button" size="lg" variant="outline" onClick={onBack}>
          {copy.common.done}
        </Button>
      ) : needsSignIn ? (
        <Button
          type="button"
          size="lg"
          onClick={() => redirectToDeviceSignIn(phygitalTokenPda, returnTo)}
        >
          {copy.wallet.claimCta}
        </Button>
      ) : showClaim ? (
        <Button
          type="button"
          size="lg"
          onClick={() => {
            if (onClaim) onClaim();
            else redirectToClaimSetup(phygitalTokenPda, returnTo);
          }}
        >
          {copy.wallet.claimBannerAction}
        </Button>
      ) : null}
    </div>
  );
}
