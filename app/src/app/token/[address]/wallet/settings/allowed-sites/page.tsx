"use client";

import { AllowedSitesSheet } from "@/components/wallet/allowed-sites-sheet";
import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function AllowedSitesPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="allowedOrigins">
      <AllowedSitesSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
