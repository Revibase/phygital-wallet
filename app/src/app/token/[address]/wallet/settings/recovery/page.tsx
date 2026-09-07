"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { RecoveryWalletSheet } from "@/components/wallet/recovery-wallet-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function RecoveryPage() {
  const { tokenAddress, backSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="recoveryWallet">
      <RecoveryWalletSheet
        phygitalTokenPda={tokenAddress}
        onClose={backSettings}
      />
    </OwnerSettingsGate>
  );
}
