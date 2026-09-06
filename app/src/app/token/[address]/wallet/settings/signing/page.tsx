"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { SigningSettingsSheet } from "@/components/wallet/signing-settings-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function SigningPage() {
  const { tokenAddress, goSettings } = useWalletRoute();
  return (
    <OwnerSettingsGate target="signing">
      <SigningSettingsSheet
        phygitalTokenPda={tokenAddress}
        onClose={() => goSettings()}
      />
    </OwnerSettingsGate>
  );
}
