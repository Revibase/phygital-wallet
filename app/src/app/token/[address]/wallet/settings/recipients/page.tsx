"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { RecipientsSheet } from "@/components/wallet/recipients-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function RecipientsPage() {
  const { tokenAddress, backSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="recipients">
      <RecipientsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
