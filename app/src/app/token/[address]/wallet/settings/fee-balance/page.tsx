"use client";

import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { FeeBalanceSheet } from "@/components/wallet/fee-balance-sheet";

export default function FeeBalancePage() {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return (
    <FeeBalanceSheet phygitalTokenPda={tokenAddress} onBack={backSettings} />
  );
}
