"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { TokenMintedPanel } from "@/components/token/token-minted-panel";
import { useTokenWalletChip } from "@/hooks/wallet/use-token-wallet-chip";
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

  useTokenWalletChip({
    onToggle: goWallet,
    viewingWallet: false,
  });

  return (
    <TokenVerifySessionGate
      session={session}
      inAppBody={copy.gate.openInBrowserBody}
    >
      <div className="flex flex-1 flex-col">
        <TokenMintedPanel
          token={session.token}
          liveConfirmed={session.liveConfirmed}
          onHoldToCheck={() => void session.holdToCheck()}
        />
      </div>
    </TokenVerifySessionGate>
  );
}
