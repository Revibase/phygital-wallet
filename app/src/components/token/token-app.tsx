"use client";

import { TokenNfcApp } from "@/components/token/token-nfc-app";
import { TokenRouteShell } from "@/components/token/token-route-shell";

/**
 * Route `/token` — Hold cold start.
 * Tap proofs (`?pk&s&c&n`) and legacy `?address=` are resolved in middleware.
 */
export function TokenApp() {
  return (
    <TokenRouteShell layout="compact">
      <TokenNfcApp />
    </TokenRouteShell>
  );
}
