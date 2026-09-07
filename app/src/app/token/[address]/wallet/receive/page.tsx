"use client";

import { ReceiveHub } from "@/components/wallet/receive-hub";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";

export default function WalletReceivePage() {
  const { walletAddress } = useWalletSession();
  const { backHome, go } = useWalletNav();
  return (
    <ReceiveHub
      walletAddress={walletAddress}
      onClose={backHome}
      onReceiveNearby={() => go("receive", "nearby")}
    />
  );
}
