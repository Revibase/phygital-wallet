"use client";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import { RecipientsSheet } from "@/components/wallet/recipients-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function RecipientsPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="recipients">
      <RecipientsSheet
        phygitalTokenPda={tokenAddress}
        onBack={backSettings}
      />
    </OwnerSettingsGate>
  );
}
