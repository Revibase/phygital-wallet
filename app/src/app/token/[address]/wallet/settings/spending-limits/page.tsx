"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { SpendingLimitsSheet } from "@/components/wallet/spending-limits-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function SpendingLimitsPage() {
  const { tokenAddress, goSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="spendingLimits">
      <SpendingLimitsSheet
        phygitalTokenPda={tokenAddress}
        onBack={() => goSettings()}
      />
    </OwnerSettingsGate>
  );
}
