"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { RouteBoot } from "@/components/layout/route-boot";
import { useTokenSession } from "@/components/token/token-session";
import { walletHref } from "@/lib/wallet/token-routes";

/** Accessory entry always opens the wallet (linked mint ignored for now). */
export default function TokenAddressPage() {
  const session = useTokenSession();
  const router = useRouter();
  const tokenAddress = String(session.token.address);

  useEffect(() => {
    router.replace(walletHref(tokenAddress));
  }, [router, tokenAddress]);

  return <RouteBoot layout="wallet" />;
}
