"use client";

import { ActivityAllPanel } from "@/components/wallet/activity-all-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function WalletActivityPage() {
  const { walletAddress } = useWalletSession();
  const { backHome } = useWalletNav();
  return <ActivityAllPanel walletAddress={walletAddress} onBack={backHome} />;
}
