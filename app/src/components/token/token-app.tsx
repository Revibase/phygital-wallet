"use client";

import { TokenNfcApp } from "@/components/token/token-nfc-app";
import { TokenRouteShell } from "@/components/token/token-route-shell";

export function TokenApp() {
  return (
    <TokenRouteShell layout="compact">
      <TokenNfcApp />
    </TokenRouteShell>
  );
}
