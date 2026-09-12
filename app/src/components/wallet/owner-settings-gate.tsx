"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { LimitsSetupSheet } from "@/components/wallet/limits-setup-sheet";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { useWalletPolicy } from "@/hooks/wallet/use-wallet-policy";
import {
  isOwnerOnlySettings,
  isPolicySetupScreen,
  requiresSendProtections,
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

  // Owner: screens that live under Send protections require it to be on. Only
  // fetch the policy when this actually gates the current screen.
  const protectionsGated = isOwner && requiresSendProtections(target);
  const policy = useWalletPolicy(protectionsGated ? tokenAddress : null);
  const protectionsOn =
    policy.data?.status === "ok" && policy.data.policy != null;
  // Redirect only once we positively know protections are off; on load errors
  // (data still undefined) fall through so the sheet can surface its own error.
  const protectionsBlocked =
    protectionsGated && policy.data !== undefined && !protectionsOn;

  useEffect(() => {
    if ((visitorBlocked && !showLimitsSetup) || protectionsBlocked) {
      router.replace(walletSettingsHref(tokenAddress));
    }
  }, [
    visitorBlocked,
    showLimitsSetup,
    protectionsBlocked,
    router,
    tokenAddress,
  ]);

  if (isOwner) {
    // Hold rendering while the gating policy loads or a redirect is in flight,
    // so the protected sheet never flashes when protections are off.
    if (protectionsGated && (policy.isLoading || protectionsBlocked)) {
      return <RouteBoot />;
    }
    return children;
  }

  if (!isOwnerOnlySettings(target)) {
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
