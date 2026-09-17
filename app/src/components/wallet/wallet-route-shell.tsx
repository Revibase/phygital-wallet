"use client";

import { createContext, memo, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { WalletDesktopChrome } from "@/components/wallet/wallet-desktop-chrome";
import { WalletPanelSkeleton } from "@/components/wallet/wallet-panel-skeleton";
import type { SettingsTarget } from "@/components/wallet/settings-hub";
import { useTokenSession } from "@/components/token/token-session";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { useIsInAppBrowser } from "@/hooks/layout/use-is-in-app-browser";
import { tokenHasLinkedMint } from "@/lib/phygital/token";
import type { Collectible } from "@/lib/tokens/collectible";
import { copy } from "@/lib/copy/phygital";
import { centeredBlockClass, walletContentColumnClass } from "@/lib/layout";
import { tokenHref, walletHref, walletSendHref, walletSettingsHref } from "@/lib/wallet/token-routes";
import { navigateBack } from "@/lib/wallet/navigate-back";
import { isCollectibleSendKind, type SendAssetRef } from "@/lib/wallet/send-asset-ref";
import { invalidateWalletBalances } from "@/lib/queries";
import type { PhygitalToken } from "@/lib/phygital/token";
import { cn } from "@/lib/utils";

export type WalletGo =
  | [to: "send" | "receive" | "tokens" | "collectibles" | "activity" | "settings"]
  | [to: "receive", nested: "nearby"]
  | [to: "collectibles", mint: string];

type WalletSessionValue = {
  token: PhygitalToken;
  tokenAddress: string;
  walletAddress: string;
  mint: string | null;
  collectible: Collectible | null;
};

type WalletNavValue = {
  go: (...args: WalletGo) => void;
  goSettings: (target?: SettingsTarget) => void;
  goSend: (asset?: SendAssetRef | null) => void;
  goHome: () => void;
  goCard: () => void;
  backHome: () => void;
  backSettings: () => void;
  backTo: (fallbackHref: string) => void;
  refresh: () => void;
};

const WalletSessionContext = createContext<WalletSessionValue | null>(null);
const WalletNavContext = createContext<WalletNavValue | null>(null);

export function useWalletSession(): WalletSessionValue {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) throw new Error("useWalletSession requires WalletRouteShell");
  return ctx;
}

export function useWalletNav(): WalletNavValue {
  const ctx = useContext(WalletNavContext);
  if (!ctx) throw new Error("useWalletNav requires WalletRouteShell");
  return ctx;
}

export function useWalletRoute(): WalletSessionValue & WalletNavValue {
  return { ...useWalletSession(), ...useWalletNav() };
}

const WalletMain = memo(function WalletMain({ children }: { children: ReactNode }) {
  return <>{children}</>;
});

export function WalletRouteShell({ children }: { children: ReactNode }) {
  const { token } = useTokenSession();
  const tokenAddress = String(token.address);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const inApp = useIsInAppBrowser();
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { walletAddress } = useWalletPda(tokenAddress);
  const { collectible } = useResolvedDasCollectible(mint);

  const goCard = useCallback(() => router.push(tokenHref(tokenAddress)), [router, tokenAddress]);
  const go = useCallback((...args: WalletGo) => router.push(walletHref(tokenAddress, ...args)), [router, tokenAddress]);
  const goSettings = useCallback((target?: SettingsTarget) => router.push(walletSettingsHref(tokenAddress, target)), [router, tokenAddress]);
  const goSend = useCallback((asset?: SendAssetRef | null) => router.push(walletSendHref(tokenAddress, asset ? { mint: asset.mint, collectible: isCollectibleSendKind(asset.kind) } : null)), [router, tokenAddress]);
  const goHome = useCallback(() => router.push(walletHref(tokenAddress)), [router, tokenAddress]);
  const backTo = useCallback((fallbackHref: string) => navigateBack(router, fallbackHref), [router]);
  const backHome = useCallback(() => navigateBack(router, walletHref(tokenAddress)), [router, tokenAddress]);
  const backSettings = useCallback(() => navigateBack(router, walletSettingsHref(tokenAddress)), [router, tokenAddress]);
  const refresh = useCallback(() => {
    if (walletAddress) invalidateWalletBalances(queryClient, { wallets: [walletAddress], tokens: [tokenAddress] });
  }, [queryClient, walletAddress, tokenAddress]);

  const sessionValue = useMemo(() => walletAddress ? { token, tokenAddress, walletAddress, mint, collectible } : null, [token, tokenAddress, walletAddress, mint, collectible]);
  const navValue = useMemo(() => ({ go, goSettings, goSend, goHome, goCard, backHome, backSettings, backTo, refresh }), [go, goSettings, goSend, goHome, goCard, backHome, backSettings, backTo, refresh]);

  if (!sessionValue) {
    return (
      <div
        className={cn(
          centeredBlockClass,
          "w-full lg:items-stretch lg:justify-start lg:px-8 lg:py-6 lg:text-left",
        )}
      >
        <WalletPanelSkeleton
          variant="home"
          className={cn("w-full", walletContentColumnClass)}
        />
      </div>
    );
  }
  if (inApp) return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;

  return (
    <WalletSessionContext.Provider value={sessionValue}>
      <WalletNavContext.Provider value={navValue}>
        <WalletDesktopChrome
          pathname={pathname}
          tokenAddress={tokenAddress}
          walletAddress={sessionValue.walletAddress}
          mint={mint}
          collectible={collectible}
          go={go}
          goCard={goCard}
          goSend={() => goSend()}
          goHome={goHome}
        >
          <WalletMain>{children}</WalletMain>
        </WalletDesktopChrome>
      </WalletNavContext.Provider>
    </WalletSessionContext.Provider>
  );
}
