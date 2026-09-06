"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RouteBoot } from "@/components/layout/route-boot";
import { TokenNfcApp } from "@/components/token/token-nfc-app";
import { copy } from "@/lib/copy/phygital";
import { tryParseAddress } from "@/lib/solana/address";
import { tokenHref } from "@/lib/wallet/token-routes";

const TokenRouteShell = dynamic(
  () =>
    import("@/components/token/token-route-shell").then(
      (m) => m.TokenRouteShell,
    ),
  { ssr: false, loading: () => <RouteBoot /> },
);

const TOKEN_NFC_COPY = {
  inAppCheck: copy.gate.openInBrowserBody,
  holdBody: copy.verify.introBody,
};

/** Compat: `/token?address=X` → `/token/X` (unminted card page redirects to wallet). */
function TokenAddressQueryRedirect({ address }: { address: string }) {
  const router = useRouter();
  const parsed = tryParseAddress(address);

  useEffect(() => {
    if (!parsed) return;
    router.replace(tokenHref(String(parsed)));
  }, [parsed, router]);

  if (!parsed) {
    return (
      <TokenRouteShell layout="compact">
        <p className="py-10 text-center text-sm text-muted-foreground">
          {copy.token.itemNotOnChain}
        </p>
      </TokenRouteShell>
    );
  }

  return <RouteBoot />;
}

/** Route `/token` — NFC cold start, or redirect legacy `?address=` into path tree. */
export function TokenApp() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address")?.trim() ?? "";

  if (address) {
    return <TokenAddressQueryRedirect address={address} />;
  }

  return (
    <TokenRouteShell layout="compact">
      <TokenNfcApp nfcCopy={TOKEN_NFC_COPY} />
    </TokenRouteShell>
  );
}
