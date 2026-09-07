"use client";

import { AccessRecoverySheet } from "@/components/wallet/access-recovery-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function AccessPage() {
  const {
    tokenAddress,
    role,
    linkStatus,
    claimed,
    isOwner,
    goSettings,
    backSettings,
    requestClaim,
  } = useWalletRoute();

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
