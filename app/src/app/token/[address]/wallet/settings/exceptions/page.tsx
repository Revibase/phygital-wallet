"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { ExtraProgramsSheet } from "@/components/wallet/extra-programs-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function ExceptionsPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="extraPrograms">
      <ExtraProgramsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
