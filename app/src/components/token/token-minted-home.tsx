"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { TokenMintedPanel } from "@/components/token/token-minted-panel";
import {
  TokenVerifySessionGate,
  useTokenVerifySession,
} from "@/hooks/token/use-token-verify-session";
import { copy } from "@/lib/copy/phygital";
import type { PhygitalToken } from "@/lib/phygital/token";
import { walletHref } from "@/lib/wallet/token-routes";

/** Minted-token card gallery — Wallet control navigates to `/token/[address]/wallet`. */
export function TokenMintedHome({
  token: tokenProp,
}: {
  token: PhygitalToken;
}) {
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
          trailing={
            <Button
              type="button"
              variant="secondary"
              onClick={goWallet}
              aria-label={copy.wallet.openWalletAriaLabel}
              className="h-9 rounded-full border border-border/50 bg-muted/70 px-4 text-xs font-semibold tracking-tight shadow-none"
            >
              {copy.wallet.toWalletChip}
            </Button>
          }
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
