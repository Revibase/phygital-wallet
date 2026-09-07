"use client";

import { useWalletNav } from "@/components/wallet/wallet-route-shell";
import { RpcConnectionSheet } from "@/components/wallet/rpc-connection-sheet";

export default function RpcPage() {
  const { backSettings } = useWalletNav();
  return <RpcConnectionSheet onBack={backSettings} />;
}
