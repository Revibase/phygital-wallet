"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { RouteBoot } from "@/components/layout/route-boot";
import { Button } from "@/components/ui/button";
import { TokenNfcApp } from "@/components/token/token-nfc-app";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import { copy } from "@/lib/copy/phygital";
import { tryParseAddress } from "@/lib/solana/address";
import { tokenHref } from "@/lib/wallet/token-routes";

const TOKEN_NFC_COPY = {
  inAppCheck: copy.gate.openInBrowserBody,
  holdBody: copy.wallet.holdToOpenBody,
};

/**
 * Idle Hold UI — must match {@link TokenNfcApp}'s default (no tap proof) tree.
 * Used as the Suspense fallback so SSR HTML hydrates cleanly with useSearchParams.
 */
function TokenColdStartIdle({
  body = TOKEN_NFC_COPY.holdBody,
}: {
  body?: string;
}) {
  return (
    <CeremonyShell>
      <NfcHoldStatus
        size="lg"
        pulsing
        title={copy.wallet.holdToOpenTitle}
        body={body}
        action={
          <Button type="button" size="lg" className="w-full rounded-full">
            {copy.wallet.holdToOpenCta}
          </Button>
        }
      />
    </CeremonyShell>
  );
}

function TokenColdStartFallback() {
  return (
    <TokenRouteShell layout="compact">
      <TokenColdStartIdle />
    </TokenRouteShell>
  );
}

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

  return <RouteBoot layout="compact" />;
}

function TokenAppInner() {
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

/**
 * Route `/token` — NFC cold start, or redirect legacy `?address=` into path tree.
 *
 * Search-param work stays inside Suspense with an idle Hold fallback that matches
 * the client tree (avoids React #418 from `dynamic(..., { ssr: false })` / RouteBoot).
 */
export function TokenApp() {
  return (
    <Suspense fallback={<TokenColdStartFallback />}>
      <TokenAppInner />
    </Suspense>
  );
}
