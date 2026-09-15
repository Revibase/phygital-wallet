"use client";

import { Button } from "@/components/ui/button";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy } from "@/lib/copy/phygital";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Owner sign-in control. Signed out → opens the secure-signer sheet;
 * signed in → shows the truncated address and signs out on click.
 */
export function OwnerConnectButton({
  className,
  signInLabel = copy.home.welcomeSignIn,
}: {
  className?: string;
  signInLabel?: string;
}) {
  const { address, isAuthenticated, isLoading, login, logout } =
    useOwnerWallet();

  if (isLoading) {
    return (
      <Button type="button" variant="outline" className={className} disabled>
        …
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => void logout()}
      >
        {address ? shortenAddress(address) : "Sign out"}
      </Button>
    );
  }

  return (
    <Button type="button" className={className} onClick={() => void login()}>
      {signInLabel}
    </Button>
  );
}
