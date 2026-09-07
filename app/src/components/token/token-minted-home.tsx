"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { IdentityChip } from "@/components/shared/identity-chip";
import { NavBar } from "@/components/shared/nav-bar";
import { TokenMintedPanel } from "@/components/token/token-minted-panel";
import {
  TokenVerifySessionGate,
  useTokenVerifySession,
} from "@/hooks/token/use-token-verify-session";
import { copy } from "@/lib/copy/phygital";
import type { PhygitalToken } from "@/lib/phygital/token";
import { walletHref } from "@/lib/wallet/token-routes";

/** Minted-token card gallery — wallet chip navigates to `/token/[address]/wallet`. */
export function TokenMintedHome({ token: tokenProp }: { token: PhygitalToken }) {
  const router = useRouter();
  const session = useTokenVerifySession(tokenProp);
  const tokenAddress = String(session.token.address);

  const goWallet = useCallback(() => {
    router.push(walletHref(tokenAddress));
  }, [router, tokenAddress]);

  return (
    <TokenVerifySessionGate
      session={session}
      inAppBody={copy.gate.openInBrowserBody}
    >
      <div className="flex flex-1 flex-col">
        <NavBar
          trailing={<IdentityChip viewingWallet={false} onToggle={goWallet} />}
        />
        <TokenMintedPanel
          token={session.token}
          liveConfirmed={session.liveConfirmed}
          onHoldToCheck={() => void session.holdToCheck()}
        />
      </div>
    </TokenVerifySessionGate>
  );
}
