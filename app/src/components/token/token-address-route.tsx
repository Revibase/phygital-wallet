"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import { Button } from "@/components/ui/button";
import { AccessoryAuthorityPrompt } from "@/components/wallet/accessory-authority-prompt";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { copy } from "@/lib/copy/phygital";
import { isWalletCeremonyPath, type ShellLayout } from "@/lib/layout";
import { tokenHasLinkedMint, type PhygitalToken } from "@/lib/phygital/token";
import { queryKeys } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";

export type TokenHomeRenderArgs = { token: PhygitalToken };

function layoutForRoute(token: PhygitalToken, pathname: string): ShellLayout {
  if (isWalletCeremonyPath(pathname)) return "compact";
  if (/\/wallet(?:\/|$)/.test(pathname)) return "wallet";
  return tokenHasLinkedMint(token) ? "gallery" : "compact";
}

/** Token routes are unlocked only by a local accessory authentication. */
export function TokenAddressRoute({ tokenAddress, children }: { tokenAddress: string; children?: ReactNode | ((args: TokenHomeRenderArgs) => ReactNode) }) {
  const restoring = useIsRestoring();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const tokenQuery = usePhygitalTokenByAddress(tokenAddress);
  const token = restoring ? undefined : tokenQuery.data;
  const mint = token && tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);
  const accessory = useAccessoryHold();
  const unlock = useQuery({ queryKey: queryKeys.browseUnlock.byToken(tokenAddress), queryFn: async () => false, enabled: false });
  const sessionValue = useMemo(() => (token && unlock.data === true ? { token } : null), [token, unlock.data]);
  const layout = sessionValue ? layoutForRoute(sessionValue.token, pathname) : "compact";

  async function holdToOpen() {
    const connection = await accessory.hold({ expectedPhygitalToken: tokenAddress });
    if (connection) queryClient.setQueryData(queryKeys.browseUnlock.byToken(tokenAddress), true);
  }

  return (
    <TokenRouteShell layout={layout}>
      {sessionValue ? (
        <AccessoryAuthorityPrompt phygitalTokenPda={tokenAddress}>
          {typeof children === "function" ? children(sessionValue) : children ?? null}
        </AccessoryAuthorityPrompt>
      ) : restoring || tokenQuery.isPending ? (
        <CeremonyShell><NfcHoldStatus size="lg" pulsing busy imageSrc={collectible?.image} imageAlt={collectible?.name ?? ""} title={copy.verify.verifyingChip} /></CeremonyShell>
      ) : accessory.showInAppGate ? (
        <InAppBrowserGate body={copy.gate.openInBrowserBody} />
      ) : token ? (
        <CeremonyShell><NfcHoldStatus size="lg" pulsing={accessory.holding} busy={accessory.holding} progress={accessory.holding} imageSrc={collectible?.image} imageAlt={collectible?.name ?? ""} title={copy.wallet.holdToOpenTitle} body={accessory.error ?? copy.wallet.holdCeremonyBody} action={<Button type="button" size="lg" className="w-full rounded-full" disabled={accessory.holding} onClick={() => void holdToOpen()}>{accessory.error ? copy.common.tryAgain : copy.wallet.holdToOpenCta}</Button>} /></CeremonyShell>
      ) : (
        <GateMessage icon={<RevibaseMark className="size-5 text-muted-foreground" />} title={copy.token.itemLoadFailed} body={toUserErrorMessage(tokenQuery.error, copy.token.itemNotOnChain)} action={<Button type="button" size="lg" className="w-full" onClick={() => void tokenQuery.refetch()}>{copy.common.tryAgain}</Button>} />
      )}
    </TokenRouteShell>
  );
}
