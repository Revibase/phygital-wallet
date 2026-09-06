"use client";

import { SettingsHub } from "@/components/wallet/settings-hub";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function WalletSettingsPage() {
  const { tokenAddress, role, linkStatus, claimed, goHome, goSettings } =
    useWalletRoute();

  return (
    <SettingsHub
      phygitalTokenPda={tokenAddress}
      role={role}
      linkStatus={linkStatus}
      claimed={claimed}
      onBack={goHome}
      onOpen={(target) => goSettings(target)}
    />
  );
}
