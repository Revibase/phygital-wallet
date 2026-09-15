"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { OwnerDashboard } from "@/components/home/owner-dashboard";
import { OwnerWelcome } from "@/components/home/owner-welcome";
import { RouteBoot } from "@/components/layout/route-boot";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { consumePendingReturn } from "@/lib/wallet/claim-return";

/**
 * Home hub: the central place to set up and use the Helius embedded wallet.
 * Signed out → welcome / sign-in; signed in → the owner dashboard. Once the
 * owner authenticates, resume any pending return (e.g. a claim the user was
 * redirected here to sign in for).
 */
export function OwnerHome() {
  const router = useRouter();
  const { address, isAuthenticated, isLoading } = useOwnerWallet();

  useEffect(() => {
    if (!isAuthenticated) return;
    const path = consumePendingReturn();
    if (path) router.replace(path);
  }, [isAuthenticated, router]);

  if (isLoading) return <RouteBoot layout="home" />;

  return (
    <AppShell layout="home">
      {isAuthenticated && address ? (
        <OwnerDashboard owner={address} />
      ) : (
        <OwnerWelcome />
      )}
    </AppShell>
  );
}
