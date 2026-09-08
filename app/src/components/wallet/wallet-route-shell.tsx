"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { StageTransition } from "@/components/shared/stage-transition";
import { ClaimItemSheet } from "@/components/wallet/claim-item-sheet";
import { OpenApprovalsSheet } from "@/components/wallet/open-approvals-sheet";
import { WalletDesktopChrome } from "@/components/wallet/wallet-desktop-chrome";
import type { SettingsTarget } from "@/components/wallet/settings-hub";
import { useTokenSession } from "@/components/token/token-session";
import { useWalletPda } from "@/hooks/wallet/use-wallet-pda";
import { useOpenApprovals } from "@/hooks/wallet/use-open-approvals";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { useIsInAppBrowser } from "@/hooks/layout/use-is-in-app-browser";
import { tokenHasLinkedMint } from "@/lib/phygital/token";
import type { Collectible } from "@/lib/tokens/collectible";
import { copy } from "@/lib/copy/phygital";
import { isClaimDismissed } from "@/lib/wallet/claim-setup-href";
import { isWalletCeremonyPath } from "@/lib/layout";
import {
  tokenHref,
  walletHref,
  walletSendHref,
  walletSettingsHref,
} from "@/lib/wallet/token-routes";
import { navigateBack } from "@/lib/wallet/navigate-back";
import {
  isCollectibleSendKind,
  type SendAssetRef,
} from "@/lib/wallet/send-asset-ref";
import { invalidateWalletBalances } from "@/lib/queries";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import type { PhygitalToken } from "@/lib/phygital/token";
import type { WalletRole } from "@/components/token/token-address-route";

/** Allowlisted wallet soft-nav targets. */
export type WalletGo =
  | [to: "send" | "receive" | "tokens" | "collectibles" | "activity" | "settings"]
  | [to: "receive", nested: "nearby"]
  | [to: "collectibles", mint: string];

type WalletSessionValue = {
  token: PhygitalToken;
  role: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
  tokenAddress: string;
  walletAddress: string;
  mint: string | null;
  collectible: Collectible | null;
  isOwner: boolean;
  linkedElsewhere: boolean;
  unclaimed: boolean;
  claimedQuiet: boolean;
};

type WalletNavValue = {
  requestClaim: () => void;
  go: (...args: WalletGo) => void;
  goSettings: (target?: SettingsTarget) => void;
  goSend: (asset?: SendAssetRef | null) => void;
  goHome: () => void;
  goCard: () => void;
  /** Pop history toward wallet home (matches swipe-back). */
  backHome: () => void;
  /** Pop history toward settings hub (matches swipe-back). */
  backSettings: () => void;
  /** Pop history toward an arbitrary allowlisted href. */
  backTo: (fallbackHref: string) => void;
  refresh: () => void;
};

type WalletRouteValue = WalletSessionValue & WalletNavValue;

const WalletSessionContext = createContext<WalletSessionValue | null>(null);
const WalletNavContext = createContext<WalletNavValue | null>(null);

/** Session / ownership / portfolio identity for the active wallet. */
export function useWalletSession(): WalletSessionValue {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) {
    throw new Error("useWalletSession requires WalletRouteShell");
  }
  return ctx;
}

/** Navigation helpers — stable across collectible/DAS identity churn. */
export function useWalletNav(): WalletNavValue {
  const ctx = useContext(WalletNavContext);
  if (!ctx) {
    throw new Error("useWalletNav requires WalletRouteShell");
  }
  return ctx;
}

/** Full route bag (session + nav). Prefer the narrower hooks when possible. */
export function useWalletRoute(): WalletRouteValue {
  return { ...useWalletSession(), ...useWalletNav() };
}

export function useRequestClaim(): () => void {
  return useWalletNav().requestClaim;
}

/** Keeps page children stable while overlay host re-renders. */
const WalletMain = memo(function WalletMain({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
});

/**
 * Shared chrome for `/token/[address]/wallet/**`.
 * Claim + open-approvals live in an overlay host so their queries/state do not
 * re-render leaf pages.
 */
export function WalletRouteShell({ children }: { children: ReactNode }) {
  const session = useTokenSession();
  const { token, role, linkStatus, claimed } = session;
  const tokenAddress = String(token.address);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const inApp = useIsInAppBrowser();
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { walletAddress } = useWalletPda(tokenAddress);
  const { collectible } = useResolvedDasCollectible(mint);

  const isOwner = role === "owner";
  const isWalletHome =
    pathname === walletHref(tokenAddress) ||
    pathname === `${walletHref(tokenAddress)}/`;

  const linkedElsewhere = linkStatus === "linked_elsewhere";
  const unclaimed = claimed === false;
  const claimedQuiet = claimed === true && !isOwner && !linkedElsewhere;

  const claimRequestRef = useRef<(() => void) | null>(null);
  const requestClaim = useCallback(() => {
    claimRequestRef.current?.();
  }, []);

  const goCard = useCallback(() => {
    router.push(tokenHref(tokenAddress));
  }, [router, tokenAddress]);

  const go = useCallback(
    (...args: WalletGo) => {
      router.push(walletHref(tokenAddress, ...args));
    },
    [router, tokenAddress],
  );

  const goSettings = useCallback(
    (target?: SettingsTarget) => {
      router.push(walletSettingsHref(tokenAddress, target));
    },
    [router, tokenAddress],
  );

  const goSend = useCallback(
    (asset?: SendAssetRef | null) => {
      router.push(
        walletSendHref(
          tokenAddress,
          asset
            ? {
                mint: asset.mint,
                collectible: isCollectibleSendKind(asset.kind),
              }
            : null,
        ),
      );
    },
    [router, tokenAddress],
  );

  const goHome = useCallback(() => {
    router.push(walletHref(tokenAddress));
  }, [router, tokenAddress]);

  const backTo = useCallback(
    (fallbackHref: string) => {
      navigateBack(router, fallbackHref);
    },
    [router],
  );

  const backHome = useCallback(() => {
    navigateBack(router, walletHref(tokenAddress));
  }, [router, tokenAddress]);

  const backSettings = useCallback(() => {
    navigateBack(router, walletSettingsHref(tokenAddress));
  }, [router, tokenAddress]);

  const refresh = useCallback(() => {
    if (!walletAddress) return;
    invalidateWalletBalances(queryClient, {
      wallets: [walletAddress],
      tokens: [tokenAddress],
    });
  }, [queryClient, walletAddress, tokenAddress]);

  const sessionValue = useMemo((): WalletSessionValue | null => {
    if (!walletAddress) return null;
    return {
      token,
      role,
      linkStatus,
      claimed,
      tokenAddress,
      walletAddress,
      mint,
      collectible,
      isOwner,
      linkedElsewhere,
      unclaimed,
      claimedQuiet,
    };
  }, [
    token,
    role,
    linkStatus,
    claimed,
    tokenAddress,
    walletAddress,
    mint,
    collectible,
    isOwner,
    linkedElsewhere,
    unclaimed,
    claimedQuiet,
  ]);

  const navValue = useMemo(
    (): WalletNavValue => ({
      requestClaim,
      go,
      goSettings,
      goSend,
      goHome,
      goCard,
      backHome,
      backSettings,
      backTo,
      refresh,
    }),
    [
      requestClaim,
      go,
      goSettings,
      goSend,
      goHome,
      goCard,
      backHome,
      backSettings,
      backTo,
      refresh,
    ],
  );

  if (!sessionValue) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {copy.common.loading}
      </p>
    );
  }

  if (inApp) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  return (
    <WalletSessionContext.Provider value={sessionValue}>
      <WalletNavContext.Provider value={navValue}>
        {isWalletCeremonyPath(pathname) ? (
          <div className="mx-auto flex w-full min-w-0 flex-1 flex-col">
            <WalletRouteOverlays
              tokenAddress={tokenAddress}
              isOwner={isOwner}
              isWalletHome={isWalletHome}
              linkedElsewhere={linkedElsewhere}
              unclaimed={unclaimed}
              claimedQuiet={claimedQuiet}
              registerRequestClaim={(fn) => {
                claimRequestRef.current = fn;
              }}
            >
              {children}
            </WalletRouteOverlays>
          </div>
        ) : (
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
            <WalletRouteOverlays
              tokenAddress={tokenAddress}
              isOwner={isOwner}
              isWalletHome={isWalletHome}
              linkedElsewhere={linkedElsewhere}
              unclaimed={unclaimed}
              claimedQuiet={claimedQuiet}
              registerRequestClaim={(fn) => {
                claimRequestRef.current = fn;
              }}
            >
              {children}
            </WalletRouteOverlays>
          </WalletDesktopChrome>
        )}
      </WalletNavContext.Provider>
    </WalletSessionContext.Provider>
  );
}

function WalletRouteOverlays({
  children,
  tokenAddress,
  isOwner,
  isWalletHome,
  linkedElsewhere,
  unclaimed,
  claimedQuiet,
  registerRequestClaim,
}: {
  children: ReactNode;
  tokenAddress: string;
  isOwner: boolean;
  isWalletHome: boolean;
  linkedElsewhere: boolean;
  unclaimed: boolean;
  claimedQuiet: boolean;
  registerRequestClaim: (fn: () => void) => void;
}) {
  const router = useRouter();
  const [deferSecondary, setDeferSecondary] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setDeferSecondary(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const openApprovals = useOpenApprovals(
    isOwner && isWalletHome && deferSecondary ? tokenAddress : null,
  );
  const [dismissedApprovalHashes, setDismissedApprovalHashes] = useState(
    () => new Set<string>(),
  );
  const [claimSessionDismissed, setClaimSessionDismissed] = useState(() =>
    isClaimDismissed(tokenAddress),
  );
  const [forceClaim, setForceClaim] = useState(false);

  useEffect(() => {
    registerRequestClaim(() => setForceClaim(true));
  }, [registerRequestClaim]);

  // Drop dismiss markers once the server list no longer includes them (TTL / grant).
  useEffect(() => {
    setDismissedApprovalHashes((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(openApprovals.approvals.map((a) => a.intentHash));
      let changed = false;
      const next = new Set<string>();
      for (const hash of prev) {
        if (live.has(hash)) next.add(hash);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [openApprovals.approvals]);

  useEffect(() => {
    setClaimSessionDismissed(isClaimDismissed(tokenAddress));
    setForceClaim(false);
    setDismissedApprovalHashes(new Set());
  }, [tokenAddress]);

  const needsClaim =
    !isOwner && unclaimed && !linkedElsewhere && !claimSessionDismissed;
  const showClaimSheet =
    needsClaim || (forceClaim && !isOwner && !linkedElsewhere && !claimedQuiet);

  const visibleApprovals = openApprovals.approvals.filter(
    (a) => !dismissedApprovalHashes.has(a.intentHash),
  );

  const showOpenApprovals =
    isOwner &&
    visibleApprovals.length > 0 &&
    isWalletHome &&
    !showClaimSheet;

  const stageKey = showClaimSheet ? "claim" : "wallet";

  let body: ReactNode = <WalletMain>{children}</WalletMain>;
  if (showClaimSheet) {
    body = (
      <ClaimItemSheet
        phygitalTokenPda={tokenAddress}
        onClaimed={() => {
          setForceClaim(false);
          setClaimSessionDismissed(true);
          router.push(walletHref(tokenAddress));
        }}
        onDismiss={() => {
          setForceClaim(false);
          setClaimSessionDismissed(true);
        }}
      />
    );
  }

  return (
    <>
      <StageTransition stageKey={stageKey} variant="fade">
        {body}
      </StageTransition>
      <OpenApprovalsSheet
        phygitalTokenPda={tokenAddress}
        approvals={visibleApprovals}
        open={showOpenApprovals}
        onDismiss={(intentHash) => {
          setDismissedApprovalHashes((prev) => new Set(prev).add(intentHash));
        }}
      />
    </>
  );
}
