"use client";

import { RpcConnectionSheet } from "@/components/wallet/rpc-connection-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";

export default function RpcConnectionPage() {
  const { goSettings } = useWalletRoute();
  return <RpcConnectionSheet onBack={() => goSettings()} />;
}
