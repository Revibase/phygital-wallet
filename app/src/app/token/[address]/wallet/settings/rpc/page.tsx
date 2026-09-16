"use client";

import { useWalletNav } from "@/components/wallet/wallet-route-shell";
import { RpcConnectionPanel } from "@/components/wallet/rpc-connection-panel";

export default function RpcPage() {
  const { backSettings } = useWalletNav();
  return <RpcConnectionPanel onBack={backSettings} />;
}
