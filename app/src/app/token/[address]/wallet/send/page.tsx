"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SendFlow } from "@/components/wallet/send-flow";
import {
  SendHoldStage,
  type SendCeremonyState,
} from "@/components/wallet/send-hold-stage";
import { StageTransition } from "@/components/shared/stage-transition";
import { RouteBoot } from "@/components/layout/route-boot";
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
import {
  parseSendSearchParams,
  settingsFromDenyCode,
} from "@/lib/wallet/token-routes";

export default function WalletSendPage() {
  return (
    <Suspense fallback={<RouteBoot />}>
      <WalletSendPageInner />
    </Suspense>
  );
}

function WalletSendPageInner() {
  const { tokenAddress, walletAddress } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  const searchParams = useSearchParams();
  const [ceremony, setCeremony] = useState<SendCeremonyState>({
    stage: "idle",
  });

  const { mint, collectible } = parseSendSearchParams(searchParams);
  let initialAsset: SendAssetRef | null = null;
  if (collectible) {
    const c = portfolio.data?.collectibles.find(
      (x) => x.mint === String(collectible),
    );
    if (c) initialAsset = collectibleToSendAsset(c);
  } else if (mint) {
    const h = portfolio.data?.holdings.find((x) => x.mint === String(mint));
    if (h) initialAsset = holdingToSendAsset(h);
  }

  const inCeremony = ceremony.stage !== "idle";

  return (
    <StageTransition
      stageKey={inCeremony ? "send-ceremony" : "send-form"}
      variant="fade"
    >
      {ceremony.stage === "holding" || ceremony.stage === "success" ? (
        <SendHoldStage
          phase={ceremony.stage}
          signPhase={
            ceremony.stage === "holding" ? ceremony.signPhase : null
          }
          imageSrc={ceremony.recap.imageSrc}
          recap={ceremony.recap}
          onClose={backHome}
        />
      ) : (
        <SendFlow
          phygitalTokenPda={tokenAddress}
          walletAddress={walletAddress}
          portfolio={portfolio.data}
          initialAsset={initialAsset}
          tokensOnly={!collectible}
          onClose={backHome}
          onCeremonyChange={setCeremony}
          onChangeLimits={(code) => goSettings(settingsFromDenyCode(code))}
        />
      )}
    </StageTransition>
  );
}
