"use client";

import { ActivityAllSheet } from "@/components/wallet/activity-all-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function WalletActivityPage() {
  const { walletAddress } = useWalletSession();
  const { backHome } = useWalletNav();
  return <ActivityAllSheet walletAddress={walletAddress} onBack={backHome} />;
}
