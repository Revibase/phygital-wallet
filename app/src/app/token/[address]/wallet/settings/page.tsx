"use client";

import { SettingsHub } from "@/components/wallet/settings-hub";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

/** Settings index — full main pane (2-col groups on desktop). */
export default function WalletSettingsPage() {
  const { tokenAddress, role, linkStatus, claimed } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();

  return (
    <SettingsHub
      phygitalTokenPda={tokenAddress}
      role={role}
      linkStatus={linkStatus}
      claimed={claimed}
      onBack={backHome}
      onOpen={(target) => goSettings(target)}
    />
  );
}
