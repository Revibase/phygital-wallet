"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { TokenMintedPanel } from "@/components/token/token-minted-panel";
import { WalletWorkspace } from "@/components/wallet/wallet-workspace";
import { useTokenWalletChip } from "@/hooks/wallet/use-token-wallet-chip";
import {
  TokenVerifySessionGate,
  useTokenVerifySession,
} from "@/hooks/token/use-token-verify-session";
import { useMintedCollectibleView } from "@/hooks/token/use-minted-collectible-view";
import { copy } from "@/lib/copy/phygital";
import {
  tokenHasLinkedMint,
  type PhygitalToken,
} from "@/lib/phygital/token";
import type { WalletRole } from "@/components/token/token-address-route";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import { isPolicySetupScreen } from "@/lib/wallet/limits-setup-href";

/** Minted-token home — card gallery; wallet chip toggles mint ↔ wallet. */
export function TokenMintedHome({
  token: tokenProp,
  role = "visitor",
  linkStatus,
  claimed,
}: {
  token: PhygitalToken;
  role?: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
}) {
  const session = useTokenVerifySession(tokenProp);
  const mint = tokenHasLinkedMint(session.token)
    ? String(session.token.mint)
    : null;
  const { collectible } = useMintedCollectibleView(mint);
  const searchParams = useSearchParams();
  const deepScreen = searchParams.get("screen");
  const [showWallet, setShowWallet] = useState(() =>
    Boolean(deepScreen && isPolicySetupScreen(deepScreen)),
  );

  useEffect(() => {
    if (deepScreen && isPolicySetupScreen(deepScreen)) {
      setShowWallet(true);
    }
  }, [deepScreen]);

  const toggleWallet = useCallback(() => {
    setShowWallet((open) => !open);
  }, []);

  useTokenWalletChip({
    onToggle: toggleWallet,
    viewingWallet: showWallet,
  });

  return (
    <TokenVerifySessionGate
      session={session}
      inAppBody={copy.gate.openInBrowserBody}
    >
      {showWallet ? (
        <WalletWorkspace
          token={session.token}
          role={role}
          linkStatus={linkStatus}
          claimed={claimed}
          onBackToCard={() => setShowWallet(false)}
          cardLabel={collectible?.name ?? copy.wallet.backToCard}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <TokenMintedPanel
            token={session.token}
            liveConfirmed={session.liveConfirmed}
            onHoldToCheck={() => void session.holdToCheck()}
          />
        </div>
      )}
    </TokenVerifySessionGate>
  );
}
