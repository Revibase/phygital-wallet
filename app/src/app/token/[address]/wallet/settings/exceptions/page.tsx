"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { ExtraProgramsSheet } from "@/components/wallet/extra-programs-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function ExceptionsPage() {
  const { tokenAddress, backSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="extraPrograms">
      <ExtraProgramsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
