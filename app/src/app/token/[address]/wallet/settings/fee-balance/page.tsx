"use client";

import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { FeeBalancePanel } from "@/components/wallet/fee-balance-panel";

export default function FeeBalancePage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <FeeBalancePanel phygitalTokenPda={tokenAddress} onBack={backSettings} />
  );
}
