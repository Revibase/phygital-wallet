"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { LimitsSetupSheet } from "@/components/wallet/limits-setup-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import {
  isOwnerOnlySettings,
  isPolicySetupScreen,
  walletSettingsHref,
} from "@/lib/wallet/token-routes";
import type { SettingsTarget } from "@/components/wallet/settings-hub";
import { RouteBoot } from "@/components/layout/route-boot";

/**
 * Owner-only settings leaf: visitors see LimitsSetup (or redirect to hub for
 * signing/recovery).
 */
export function OwnerSettingsGate({
  target,
  children,
}: {
  target: SettingsTarget;
  children: ReactNode;
}) {
  const { isOwner, linkStatus, claimed, tokenAddress } = useWalletSession();
  const { backSettings, requestClaim } = useWalletNav();
  const router = useRouter();
  const visitorBlocked = !isOwner && isOwnerOnlySettings(target);
  const showLimitsSetup = visitorBlocked && isPolicySetupScreen(target);

  useEffect(() => {
    if (visitorBlocked && !showLimitsSetup) {
      router.replace(walletSettingsHref(tokenAddress));
    }
  }, [visitorBlocked, showLimitsSetup, router, tokenAddress]);

  if (isOwner || !isOwnerOnlySettings(target)) {
    return children;
  }

  if (showLimitsSetup) {
    return (
      <LimitsSetupSheet
        phygitalTokenPda={tokenAddress}
        linkStatus={linkStatus}
        claimed={claimed}
        screen={target}
        onBack={backSettings}
        onClaim={requestClaim}
      />
    );
  }

  return <RouteBoot />;
}
