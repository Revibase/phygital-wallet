"use client";

import { FeeBalanceSheet } from "@/components/wallet/fee-balance-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function FeeBalancePage() {
  const { tokenAddress, backSettings } = useWalletRoute();
  return (
    <FeeBalanceSheet
      phygitalTokenPda={tokenAddress}
      onBack={backSettings}
    />
  );
}
