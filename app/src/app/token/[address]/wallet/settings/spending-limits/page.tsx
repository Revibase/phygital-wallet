"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { SpendingLimitsSheet } from "@/components/wallet/spending-limits-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function SpendingLimitsPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="spendingLimits">
      <SpendingLimitsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
