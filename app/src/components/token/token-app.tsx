"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { RouteBoot } from "@/components/layout/route-boot";
import {
  TokenAddressRoute,
  type WalletRole,
} from "@/components/token/token-address-route";
import { TokenMintedHome } from "@/components/token/token-minted-home";
import { TokenNfcApp } from "@/components/token/token-nfc-app";
import { TokenUnmintedHome } from "@/components/token/token-unminted-home";
import { copy } from "@/lib/copy/phygital";
import {
  tokenHasLinkedMint,
  type PhygitalToken,
} from "@/lib/phygital/token";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";

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

function TokenHome({
  token,
  role,
  linkStatus,
  claimed,
}: {
  token: PhygitalToken;
  role: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
}): ReactNode {
  if (tokenHasLinkedMint(token)) {
    return (
      <TokenMintedHome
        token={token}
        role={role}
        linkStatus={linkStatus}
        claimed={claimed}
      />
    );
  }
  return (
    <TokenUnmintedHome
      token={token}
      role={role}
      linkStatus={linkStatus}
      claimed={claimed}
    />
  );
}

/** Route `/token` — possession unlock; no platform passkey gate. */
export function TokenApp() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address")?.trim() ?? "";

  if (address) {
    return (
      <TokenAddressRoute
        tokenAddress={address}
        renderHome={({ token, role, linkStatus, claimed }) => (
          <TokenHome
            token={token}
            role={role}
            linkStatus={linkStatus}
            claimed={claimed}
          />
        )}
      />
    );
  }

  return (
    <TokenRouteShell layout="compact">
      <TokenNfcApp nfcCopy={TOKEN_NFC_COPY} />
    </TokenRouteShell>
  );
}
