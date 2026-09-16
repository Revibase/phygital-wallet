"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import {
  TokenSessionProvider,
  type TokenSessionValue,
} from "@/components/token/token-session";
import { TokenAddressRoute } from "@/components/token/token-address-route";
import { tryParseRouteAddress } from "@/lib/solana/address";
import { copy } from "@/lib/copy/phygital";

/**
 * Client layout for `/token/[address]/**`.
 * Unlock (`…/unlock`) is the Hold escape hatch — middleware-gated routes wrap
 * leaf pages in an unlocked session. Leaf pages never paint without middleware
 * having verified the browse-unlock cookie.
 */
export function TokenAddressLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const address = tryParseRouteAddress(params, "address");
  const isUnlock = /\/unlock\/?$/.test(pathname);

  if (!address) {
    return (
      <TokenRouteShell layout="compact">
        <GateMessage
          icon={<RevibaseMark className="size-5 text-muted-foreground" />}
          title={copy.token.itemLoadFailed}
          body={copy.token.itemNotOnChain}
        />
      </TokenRouteShell>
    );
  }

  if (isUnlock) {
    return <>{children}</>;
  }

  return (
    <TokenAddressRoute tokenAddress={String(address)}>
      {(session: TokenSessionValue) => (
        <TokenSessionProvider value={session}>{children}</TokenSessionProvider>
      )}
    </TokenAddressRoute>
  );
}
