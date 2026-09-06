"use client";

import type { ReactNode } from "react";

import { WalletRouteShell } from "@/components/wallet/wallet-route-shell";

export default function WalletLayout({ children }: { children: ReactNode }) {
  return <WalletRouteShell>{children}</WalletRouteShell>;
}
