"use client";

import dynamic from "next/dynamic";

import { OwnerSettingsGate } from "@/components/wallet/owner-settings-gate";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { RouteBoot } from "@/components/layout/route-boot";

const SigningSettingsSheet = dynamic(
  () =>
    import("@/components/wallet/signing-settings-sheet").then(
      (m) => m.SigningSettingsSheet,
    ),
  { ssr: false, loading: () => <RouteBoot /> },
);

export default function SigningPage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <OwnerSettingsGate target="signing">
      <SigningSettingsSheet
        phygitalTokenPda={tokenAddress}
        onClose={backSettings}
      />
    </OwnerSettingsGate>
  );
}
