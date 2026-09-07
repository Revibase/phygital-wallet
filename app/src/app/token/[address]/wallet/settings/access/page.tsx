"use client";

import { AccessRecoverySheet } from "@/components/wallet/access-recovery-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function AccessPage() {
  const { tokenAddress, role, linkStatus, claimed, isOwner } =
    useWalletSession();
  const { goSettings, backSettings, requestClaim } = useWalletNav();

  return (
    <AccessRecoverySheet
      phygitalTokenPda={tokenAddress}
      role={role}
      linkStatus={linkStatus}
      claimed={claimed}
      onBack={backSettings}
      onOpenRecovery={
        isOwner ? () => goSettings("recoveryWallet") : undefined
      }
      onOpenSigning={isOwner ? () => goSettings("signing") : undefined}
      onClaim={requestClaim}
    />
  );
}
