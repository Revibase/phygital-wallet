"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  useIsRestoring,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { GateMessage } from "@/components/layout/gate-message";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { TokenRouteShell } from "@/components/token/token-route-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { Button } from "@/components/ui/button";
import { useAccessoryHold } from "@/hooks/token/use-accessory-hold";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { tokenHasLinkedMint, type PhygitalToken } from "@/lib/phygital/token";
import type { ShellLayout } from "@/lib/layout";
import { isWalletCeremonyPath } from "@/lib/layout";
import { copy } from "@/lib/copy/phygital";
import { queryKeys, queryOptions } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  fetchTokenGate,
  type LinkStatus,
  type TokenGate,
} from "@/lib/wallet/device-auth-client";
import { isClaimDismissed } from "@/lib/wallet/claim-setup-href";

const LOAD_TIMEOUT_MS = 20_000;
const CLAIMED_WAIT_MS = 3_000;

export type WalletRole = "owner" | "visitor";

export type TokenHomeRenderArgs = {
  token: PhygitalToken;
  role: WalletRole;
  linkStatus?: LinkStatus;
  /** Public claimed flag; undefined while loading / unknown. */
  claimed?: boolean;
};

/** Wallet browsing uses desktop chrome; ceremonies stay phone-framed; minted card uses gallery. */
function layoutForRoute(token: PhygitalToken, pathname: string): ShellLayout {
  if (isWalletCeremonyPath(pathname)) return "compact";
  if (/\/wallet(?:\/|$)/.test(pathname)) return "wallet";
  return tokenHasLinkedMint(token) ? "gallery" : "compact";
}

function seedAuthCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  tokenAddress: string,
  gate: TokenGate,
) {
  queryClient.setQueryData(queryKeys.deviceAuth.session(), gate.session);
  queryClient.setQueryData(
    queryKeys.deviceAuth.browseUnlock(tokenAddress),
    gate.browseUnlocked,
  );
  if (gate.linkStatus) {
    queryClient.setQueryData(
      queryKeys.deviceAuth.linkStatus(tokenAddress),
      gate.linkStatus,
    );
  }
  queryClient.setQueryData(
    queryKeys.deviceAuth.claimed(tokenAddress),
    gate.claimed,
  );
}

/** Possession-first token home — platform session optional (owner convenience). */
export function TokenAddressRoute({
  tokenAddress,
  children,
}: {
  tokenAddress: string;
  children?: ReactNode | ((args: TokenHomeRenderArgs) => ReactNode);
}) {
  const isRestoring = useIsRestoring();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const tokenQuery = usePhygitalTokenByAddress(tokenAddress);

  // Under client-only layout: wait for persist restore, then use cached/fetched token.
  const token = !isRestoring ? tokenQuery.data : undefined;
  const mint = token && tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);

  const gate = useQuery({
    queryKey: queryKeys.deviceAuth.gate(tokenAddress),
    queryFn: async () => {
      const data = await fetchTokenGate(tokenAddress);
      seedAuthCaches(queryClient, tokenAddress, data);
      return data;
    },
    // Parallel with on-chain token — gate only needs the address from the URL.
    enabled: Boolean(tokenAddress),
    ...queryOptions.deviceLinks,
  });

  // Seeded by tap connect / Hold — unlock immediately without waiting on gate.
  const seededBrowse = useQuery({
    queryKey: queryKeys.deviceAuth.browseUnlock(tokenAddress),
    queryFn: async () => false,
    enabled: false,
  });

  const session = gate.data?.session ?? null;
  const linkStatus = gate.data?.linkStatus;
  const browseUnlocked =
    gate.data?.browseUnlocked === true || seededBrowse.data === true;
  const claimed = gate.data?.claimed;

  const isOwner = Boolean(session) && linkStatus === "linked_here";
  const unlocked = Boolean(token) && (isOwner || browseUnlocked);

  const role: WalletRole = isOwner ? "owner" : "visitor";

  const layout: ShellLayout =
    unlocked && token ? layoutForRoute(token, pathname) : "compact";
  const waitingToken =
    isRestoring ||
    (!token &&
      (tokenQuery.isPending || tokenQuery.isLoading || tokenQuery.isFetching));
  // Gate runs in parallel with token; only block unlock when we still need it.
  const waitingGate = gate.isPending && !unlocked;
  // Wait briefly for claimed so claim sheet doesn’t flash after wallet.
  const waitingClaimed =
    unlocked &&
    !isOwner &&
    !gate.data &&
    gate.isPending &&
    !isClaimDismissed(tokenAddress);
  const [claimedWaitTimedOut, setClaimedWaitTimedOut] = useState(false);
  useEffect(() => {
    if (!waitingClaimed) {
      setClaimedWaitTimedOut(false);
      return;
    }
    const id = window.setTimeout(
      () => setClaimedWaitTimedOut(true),
      CLAIMED_WAIT_MS,
    );
    return () => window.clearTimeout(id);
  }, [waitingClaimed]);

  const waiting =
    waitingToken || waitingGate || (waitingClaimed && !claimedWaitTimedOut);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [waiting]);

  const sessionValue = useMemo((): TokenHomeRenderArgs | null => {
    if (!unlocked || !token) return null;
    return {
      token,
      role,
      linkStatus: session ? (linkStatus ?? undefined) : undefined,
      claimed: gate.isError ? undefined : claimed,
    };
  }, [unlocked, token, role, session, linkStatus, gate.isError, claimed]);

  return (
    <TokenRouteShell layout={layout}>
      {sessionValue ? (
        typeof children === "function" ? (
          children(sessionValue)
        ) : (
          (children ?? null)
        )
      ) : waiting && !timedOut ? (
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
      ) : token && !isOwner ? (
        <AddressHoldGate
          token={token}
          tokenAddress={tokenAddress}
          onUnlocked={() => {
            queryClient.setQueryData(
              queryKeys.deviceAuth.browseUnlock(tokenAddress),
              true,
            );
            queryClient.setQueryData(
              queryKeys.deviceAuth.gate(tokenAddress),
              (prev: TokenGate | undefined) =>
                prev
                  ? { ...prev, browseUnlocked: true }
                  : {
                      session: null,
                      browseUnlocked: true,
                      linkStatus: null,
                      claimed: false,
                    },
            );
          }}
        />
      ) : (
        <GateMessage
          icon={<RevibaseMark className="size-5 text-muted-foreground" />}
          title={
            timedOut ? copy.verify.loadTimedOut : copy.token.itemLoadFailed
          }
          body={
            timedOut
              ? copy.verify.loadTimedOutBody
              : toUserErrorMessage(tokenQuery.error, copy.token.itemNotOnChain)
          }
          action={
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                setTimedOut(false);
                void tokenQuery.refetch();
                void gate.refetch();
              }}
            >
              {copy.common.tryAgain}
            </Button>
          }
        />
      )}
    </TokenRouteShell>
  );
}

function AddressHoldGate({
  token,
  tokenAddress,
  onUnlocked,
}: {
  token: PhygitalToken;
  tokenAddress: string;
  onUnlocked: () => void;
}) {
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);
  const accessory = useAccessoryHold();

  async function holdToOpen() {
    const connection = await accessory.hold({
      expectedPhygitalToken: tokenAddress,
    });
    if (!connection) return;
    try {
      onUnlocked();
    } catch (err) {
      accessory.setError(toUserErrorMessage(err, copy.verify.failedBody));
    }
  }

  if (accessory.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  if (accessory.holding) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing
          busy
          imageSrc={collectible?.image}
          imageAlt={collectible?.name ?? ""}
          title={copy.verify.holdStill}
          body={copy.verify.holdStillBody}
        />
      </CeremonyShell>
    );
  }

  const error = accessory.error;

  return (
    <CeremonyShell>
      <NfcHoldStatus
        size="lg"
        pulsing={!error}
        imageSrc={collectible?.image}
        imageAlt={collectible?.name ?? ""}
        title={error ? copy.verify.failed : copy.wallet.holdToOpenTitle}
        body={error ?? copy.wallet.holdToOpenBody}
        action={
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void holdToOpen()}
          >
            {error ? copy.common.tryAgain : copy.wallet.holdToOpenCta}
          </Button>
        }
      />
    </CeremonyShell>
  );
}
