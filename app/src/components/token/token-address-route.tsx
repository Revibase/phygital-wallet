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
import { AccessoryAuthorityPrompt } from "@/components/wallet/accessory-authority-prompt";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { copy } from "@/lib/copy/phygital";
import { isWalletCeremonyPath, type ShellLayout } from "@/lib/layout";
import { tokenHasLinkedMint, type PhygitalToken } from "@/lib/phygital/token";
import { toUserErrorMessage } from "@/lib/user-errors";

export type TokenHomeRenderArgs = { token: PhygitalToken };

function layoutForRoute(token: PhygitalToken, pathname: string): ShellLayout {
  if (isWalletCeremonyPath(pathname)) return "compact";
  if (/\/wallet(?:\/|$)/.test(pathname)) return "wallet";
  return tokenHasLinkedMint(token) ? "gallery" : "compact";
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
  const token = restoring ? undefined : tokenQuery.data;
  const mint = token && tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);
  const sessionValue = useMemo(
    () => (token ? { token } : null),
    [token],
  );
  const layout = sessionValue
    ? layoutForRoute(sessionValue.token, pathname)
    : "compact";

  return (
    <TokenRouteShell layout={layout}>
      {sessionValue ? (
        <AccessoryAuthorityPrompt phygitalTokenPda={tokenAddress}>
          {typeof children === "function"
            ? children(sessionValue)
            : children ?? null}
        </AccessoryAuthorityPrompt>
      ) : restoring || tokenQuery.isPending ? (
        <CeremonyShell>
          <NfcHoldStatus
            size="lg"
            pulsing
            busy
            imageSrc={collectible?.image}
            imageAlt={collectible?.name ?? ""}
            title={copy.verify.verifyingChip}
          />
        </CeremonyShell>
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
