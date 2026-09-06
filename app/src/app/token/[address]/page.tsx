"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TokenMintedHome } from "@/components/token/token-minted-home";
import { useTokenSession } from "@/components/token/token-session";
import { tokenHasLinkedMint } from "@/lib/phygital/token";
import { walletHref } from "@/lib/wallet/token-routes";
import { RouteBoot } from "@/components/layout/route-boot";

/**
 * `/token/[address]` — minted card; unminted accessories redirect to wallet.
 */
export default function TokenAddressPage() {
  const session = useTokenSession();
  const router = useRouter();
  const minted = tokenHasLinkedMint(session.token);

  useEffect(() => {
    if (!minted) {
      router.replace(walletHref(String(session.token.address)));
    }
  }, [minted, router, session.token.address]);

  if (!minted) {
    return <RouteBoot />;
  }

  return <TokenMintedHome token={session.token} />;
}
