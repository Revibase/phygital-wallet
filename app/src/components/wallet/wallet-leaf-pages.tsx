"use client";

import type { ComponentType } from "react";

import { ActivityAllPanel } from "@/components/wallet/activity-all-panel";
import { CollectiblesAllPanel } from "@/components/wallet/collectibles-all-panel";
import { FeeBalancePanel } from "@/components/wallet/fee-balance-panel";
import { ReceiveHub } from "@/components/wallet/receive-hub";
import { RpcConnectionPanel } from "@/components/wallet/rpc-connection-panel";
import { SettingsHub } from "@/components/wallet/settings-hub";
import { TokensAllPanel } from "@/components/wallet/tokens-all-panel";
import { WalletPolicyPanel } from "@/components/wallet/wallet-policy-panel";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPortfolio } from "@/hooks/wallet/use-wallet-portfolio";

type SettingsPanelProps = {
  phygitalTokenPda: string;
  onBack: () => void;
};

function SettingsTokenLeaf({
  Panel,
}: {
  Panel: ComponentType<SettingsPanelProps>;
}) {
  const { tokenAddress } = useWalletSession();
  const { backSettings } = useWalletNav();
  return <Panel phygitalTokenPda={tokenAddress} onBack={backSettings} />;
}

export function WalletPolicyPageClient() {
  return <SettingsTokenLeaf Panel={WalletPolicyPanel} />;
}

export function FeeBalancePageClient() {
  return <SettingsTokenLeaf Panel={FeeBalancePanel} />;
}

export function RpcPageClient() {
  const { backSettings } = useWalletNav();
  return <RpcConnectionPanel onBack={backSettings} />;
}

export function WalletTokensPageClient() {
  const { walletAddress } = useWalletSession();
  const { backHome, goSend } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  return (
    <TokensAllPanel
      holdings={portfolio.data?.holdings ?? []}
      loading={portfolio.isLoading}
      onBack={backHome}
      onSelect={(asset) => goSend(asset)}
    />
  );
}

export function WalletCollectiblesPageClient() {
  const { walletAddress } = useWalletSession();
  const { backHome, go } = useWalletNav();
  const portfolio = useWalletPortfolio(walletAddress);
  return (
    <CollectiblesAllPanel
      collectibles={portfolio.data?.collectibles ?? []}
      loading={portfolio.isLoading}
      onBack={backHome}
      onSelect={(c) => go("collectibles", c.mint)}
    />
  );
}

export function WalletActivityPageClient() {
  const { walletAddress } = useWalletSession();
  const { backHome } = useWalletNav();
  return <ActivityAllPanel walletAddress={walletAddress} onBack={backHome} />;
}

export function WalletSettingsPageClient() {
  const { tokenAddress } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();
  return (
    <SettingsHub
      phygitalTokenPda={tokenAddress}
      onBack={backHome}
      onOpen={(target) => goSettings(target)}
    />
  );
}

export function WalletReceivePageClient() {
  const { walletAddress } = useWalletSession();
  const { backHome, go } = useWalletNav();
  return (
    <ReceiveHub
      walletAddress={walletAddress}
      onClose={backHome}
      onReceiveNearby={() => go("receive", "nearby")}
    />
  );
}
