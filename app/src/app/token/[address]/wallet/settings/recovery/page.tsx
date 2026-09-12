"use client";

import dynamic from "next/dynamic";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { RouteBoot } from "@/components/layout/route-boot";

const RecoveryWalletSheet = dynamic(
  () =>
    import("@/components/wallet/recovery-wallet-sheet").then(
      (m) => m.RecoveryWalletSheet
    ),
  { ssr: false, loading: () => <RouteBoot /> }
);

export default function RecoveryPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="recoveryWallet">
      <RecoveryWalletSheet
        phygitalTokenPda={tokenAddress}
        onClose={backSettings}
      />
    </OwnerSettingsGate>
  );
}
