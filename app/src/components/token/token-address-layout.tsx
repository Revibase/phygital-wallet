"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import {
  TokenSessionProvider,
  type TokenSessionValue,
} from "@/components/token/token-session";
import { TokenAddressRoute } from "@/components/token/token-address-route";
import { tryParseAddress } from "@/lib/solana/address";
import { copy } from "@/lib/copy/phygital";

/**
 * Client layout for `/token/[address]/**`.
 * Possession unlock runs here; leaf pages never paint without a session.
 */
export function TokenAddressLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const raw =
    typeof params.address === "string"
      ? params.address
      : Array.isArray(params.address)
      ? params.address[0]
      : "";
  const address = tryParseAddress(raw);

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

  return (
    <TokenAddressRoute tokenAddress={String(address)}>
      {(session: TokenSessionValue) => (
        <TokenSessionProvider value={session}>{children}</TokenSessionProvider>
      )}
    </TokenAddressRoute>
  );
}
