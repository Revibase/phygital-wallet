"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useIsRestoring } from "@tanstack/react-query";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import { Button } from "@/components/ui/button";
import { RequireClaimedAccessory } from "@/components/wallet/require-claimed-accessory";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { copy } from "@/lib/copy/phygital";
import type { ShellLayout } from "@/lib/layout";
import type { PhygitalToken } from "@/lib/phygital/token";
import { toUserErrorMessage } from "@/lib/user-errors";

export type TokenHomeRenderArgs = { token: PhygitalToken };

function layoutForRoute(pathname: string): ShellLayout {
  if (/\/wallet(?:\/|$)/.test(pathname)) return "wallet";
  return "compact";
}

/**
 * Unlocked `/token/[address]/**` shell. Browse-unlock is enforced by middleware
 * via the httpOnly session cookie — this route only loads token data.
 */
export function TokenAddressRoute({
  tokenAddress,
  children,
}: {
  tokenAddress: string;
  children?: ReactNode | ((args: TokenHomeRenderArgs) => ReactNode);
}) {
  const restoring = useIsRestoring();
  const pathname = usePathname();
  const tokenQuery = usePhygitalTokenByAddress(tokenAddress);
  // Prefer cached data during persist restore so we don't blank the tree.
  const token = tokenQuery.data;
  const sessionValue = useMemo(
    () => (token ? { token } : null),
    [token],
  );
  const layout = layoutForRoute(pathname);

  if (!sessionValue && (restoring || tokenQuery.isPending)) {
    return (
      <TokenRouteShell layout={layout}>
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing
            busy
            title={copy.verify.verifyingChip}
          />
        </CeremonyShell>
      </TokenRouteShell>
    );
  }

  return (
    <TokenRouteShell layout={layout}>
      {sessionValue ? (
        <RequireClaimedAccessory phygitalTokenPda={tokenAddress}>
          {typeof children === "function"
            ? children(sessionValue)
            : children ?? null}
        </RequireClaimedAccessory>
      ) : (
        <GateMessage
          icon={<RevibaseMark className="size-5 text-muted-foreground" />}
          title={copy.token.itemLoadFailed}
          body={toUserErrorMessage(
            tokenQuery.error,
            copy.token.itemNotOnChain,
          )}
          action={
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => void tokenQuery.refetch()}
            >
              {copy.common.tryAgain}
            </Button>
          }
        />
      )}
    </TokenRouteShell>
  );
}
