"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Owner connect control. Signed out → opens the secure-signer sheet;
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

  async function onLogin() {
    try {
      await login();
    } catch (err) {
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
    }
  }

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
        {address ? shortenAddress(address) : copy.home.accountSignOut}
      </Button>
    );
  }

  return (
    <Button type="button" className={className} onClick={() => void onLogin()}>
      {signInLabel}
    </Button>
  );
}
