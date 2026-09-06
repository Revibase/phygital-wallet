"use client";

import { useEffect, type ReactNode } from "react";

import { LimitsSetupSheet } from "@/components/wallet/limits-setup-sheet";
import { useWalletRoute } from "@/components/wallet/wallet-route-shell";
import {
  isOwnerOnlySettings,
  isPolicySetupScreen,
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
  const { isOwner, linkStatus, claimed, goSettings, tokenAddress, requestClaim } =
    useWalletRoute();
  const visitorBlocked = !isOwner && isOwnerOnlySettings(target);
  const showLimitsSetup = visitorBlocked && isPolicySetupScreen(target);

  useEffect(() => {
    if (visitorBlocked && !showLimitsSetup) {
      goSettings();
    }
  }, [visitorBlocked, showLimitsSetup, goSettings]);

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
        onBack={() => goSettings()}
        onClaim={requestClaim}
      />
    );
  }

  return <RouteBoot />;
}
