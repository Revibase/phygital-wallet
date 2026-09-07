"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SendDialog } from "@/components/wallet/send-dialog";
import {
  SendHoldStage,
  type SendHoldRecap,
} from "@/components/wallet/send-hold-stage";
import { StageTransition } from "@/components/shared/stage-transition";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";
import {
  collectibleToSendAsset,
  holdingToSendAsset,
  type SendAssetRef,
} from "@/lib/wallet/send-asset-ref";
import { tryParseAddress } from "@/lib/solana/address";
import { settingsFromDenyCode } from "@/lib/wallet/token-routes";
import type { PhygitalWalletSignPhase } from "@/lib/wallet/sign-phase-copy";

export default function WalletSendPage() {
  const { tokenAddress, walletAddress, role } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  const searchParams = useSearchParams();
  const [holdPhase, setHoldPhase] = useState<"holding" | "success" | null>(
    null,
  );
  const [signPhase, setSignPhase] = useState<PhygitalWalletSignPhase | null>(
    null,
  );
  const [recap, setRecap] = useState<SendHoldRecap | null>(null);

  const initialAsset = useMemo((): SendAssetRef | null => {
    const mint = searchParams.get("mint");
    const collectibleMint = searchParams.get("collectible");
    if (collectibleMint && tryParseAddress(collectibleMint)) {
      const c = portfolio.data?.collectibles.find(
        (x) => x.mint === collectibleMint,
      );
      if (c) return collectibleToSendAsset(c);
    }
    if (mint && tryParseAddress(mint)) {
      const h = portfolio.data?.holdings.find((x) => x.mint === mint);
      if (h) return holdingToSendAsset(h);
    }
    return null;
  }, [searchParams, portfolio.data]);

  return (
    <StageTransition
      stageKey={holdPhase ? `send-${holdPhase}` : "send-form"}
      variant="fade"
    >
      {holdPhase ? (
        <SendHoldStage
          phase={holdPhase}
          signPhase={signPhase}
          imageSrc={recap?.imageSrc}
          recap={recap}
          onClose={backHome}
        />
      ) : (
        <SendDialog
          phygitalTokenPda={tokenAddress}
          walletAddress={walletAddress}
          portfolio={portfolio.data}
          initialAsset={initialAsset}
          tokensOnly={!searchParams.get("collectible")}
          role={role}
          onClose={backHome}
          onHoldPhaseChange={(phase, nextRecap) => {
            setHoldPhase(phase);
            if (phase == null) setSignPhase(null);
            if (nextRecap) setRecap(nextRecap);
          }}
          onSignPhaseChange={setSignPhase}
          onSent={() => {}}
          onChangeLimits={(code) => goSettings(settingsFromDenyCode(code))}
        />
      )}
    </StageTransition>
  );
}
