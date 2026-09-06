"use client";

import { WalletWorkspace } from "@/components/wallet/wallet-workspace";
import {
  TokenVerifySessionGate,
  useTokenVerifySession,
} from "@/hooks/token/use-token-verify-session";
import { copy } from "@/lib/copy/phygital";
import type { PhygitalToken } from "@/lib/phygital/token";
import type { WalletRole } from "@/components/token/token-address-route";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";

/** Unminted accessory home — Wallet panel is the landing. */
export function TokenUnmintedHome({
  token: tokenProp,
  role = "visitor",
  linkStatus,
  claimed,
}: {
  token: PhygitalToken;
  role?: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
}) {
  const session = useTokenVerifySession(tokenProp);

  return (
    <TokenVerifySessionGate
      session={session}
      inAppBody={copy.gate.openInBrowserBody}
    >
      <WalletWorkspace
        token={session.token}
        role={role}
        linkStatus={linkStatus}
        claimed={claimed}
      />
    </TokenVerifySessionGate>
  );
}
