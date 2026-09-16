"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { copy } from "@/lib/copy/phygital";
import { walletClaimHref } from "@/lib/wallet/token-routes";

/**
 * After browse-unlock: unclaimed accessories go straight to `/wallet/claim`.
 * Not dismissible — first tap is unlock → claim → wallet.
 */
export function RequireClaimedAccessory({
  phygitalTokenPda,
  children,
}: {
  phygitalTokenPda: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isClaimed, isLoading } = useTokenOwner(phygitalTokenPda);
  const onClaimRoute = /\/wallet\/claim(?:\/|$)/.test(pathname);

  useEffect(() => {
    if (isLoading || isClaimed || onClaimRoute) return;
    router.replace(walletClaimHref(phygitalTokenPda));
  }, [isClaimed, isLoading, onClaimRoute, phygitalTokenPda, router]);

  if (isLoading || (!isClaimed && !onClaimRoute)) {
    return (
      <CeremonyShell>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <p className="text-sm text-muted-foreground" role="status">
            {copy.wallet.authorityChecking}
          </p>
        </div>
      </CeremonyShell>
    );
  }

  return <>{children}</>;
}
