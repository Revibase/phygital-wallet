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
import { cn } from "@/lib/utils";

export default function WalletSendPage() {
  return (
    <Suspense fallback={<RouteBoot layout="wallet" />}>
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Keep SendFlow mounted during the hold ceremony. Unmounting it tore down
        useWalletTransaction + WalletApprovalSheet, so fee-payer policy denials
        and other post-tap errors never surfaced and the UI stayed on "Sending".
      */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          inCeremony && "hidden",
        )}
        aria-hidden={inCeremony}
      >
        <SendFlow
          phygitalTokenPda={tokenAddress}
          walletAddress={walletAddress}
          portfolio={portfolio.data}
          initialAsset={initialAsset}
          tokensOnly={!collectible}
          ceremonyActive={inCeremony}
          onClose={backHome}
          onCeremonyChange={setCeremony}
          onChangeLimits={(code) => goSettings(settingsFromDenyCode(code))}
        />
      </div>

      {ceremony.stage === "holding" || ceremony.stage === "success" ? (
        <StageTransition
          stageKey={
            ceremony.stage === "success" ? "send-success" : "send-holding"
          }
          variant="fade"
        >
          <SendHoldStage
            phase={ceremony.stage}
            signPhase={
              ceremony.stage === "holding" ? ceremony.signPhase : null
            }
            imageSrc={ceremony.recap.imageSrc}
            recap={ceremony.recap}
            onClose={backHome}
          />
        </StageTransition>
      ) : null}
    </div>
  );
}
