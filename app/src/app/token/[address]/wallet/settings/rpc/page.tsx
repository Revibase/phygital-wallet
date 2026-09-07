"use client";

import { RpcConnectionSheet } from "@/components/wallet/rpc-connection-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function RpcConnectionPage() {
  const { backSettings } = useWalletRoute();
  return <RpcConnectionSheet onBack={backSettings} />;
}
