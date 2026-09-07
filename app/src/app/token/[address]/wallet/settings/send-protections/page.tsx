"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { SendProtectionsSheet } from "@/components/wallet/send-protections-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function SendProtectionsPage() {
  const { tokenAddress, backSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="sendProtections">
      <SendProtectionsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
