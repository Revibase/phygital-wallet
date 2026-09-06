"use client";

import { Nfc } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { findPhygitalTokenPda } from "phygital-token-sdk";

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
import { copy } from "@/lib/copy/phygital";
import { queryKeys, queryOptions } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  fetchDeviceSession,
  fetchLinkStatus,
  fetchTokenClaimed,
  hasFreshPossession,
  storeAccessoryProof,
  type LinkStatus,
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

function layoutForToken(token: PhygitalToken): ShellLayout {
  return tokenHasLinkedMint(token) ? "gallery" : "compact";
}

/** Possession-first token home — platform session optional (owner convenience). */
export function TokenAddressRoute({
  tokenAddress,
  renderHome,
}: {
  tokenAddress: string;
  renderHome: (args: TokenHomeRenderArgs) => ReactNode;
}) {
  return (
    <TokenAddressRouteInner
      tokenAddress={tokenAddress}
      renderHome={renderHome}
    />
  );
}

function TokenAddressRouteInner({
  tokenAddress,
  renderHome,
}: {
  tokenAddress: string;
  renderHome: (args: TokenHomeRenderArgs) => ReactNode;
}) {
  const isRestoring = useIsRestoring();
  const tokenQuery = usePhygitalTokenByAddress(tokenAddress);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const token = hydrated && !isRestoring ? tokenQuery.data : undefined;
  const mint = token && tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);

  const session = useQuery({
    queryKey: queryKeys.deviceAuth.session(),
    queryFn: fetchDeviceSession,
    ...queryOptions.deviceSession,
  });

  const linkStatus = useQuery({
    queryKey: queryKeys.deviceAuth.linkStatus(tokenAddress),
    queryFn: () => fetchLinkStatus(tokenAddress),
    enabled: Boolean(token) && Boolean(session.data),
    ...queryOptions.deviceLinks,
  });

  const [possessionOk, setPossessionOk] = useState(false);

  useEffect(() => {
    if (hasFreshPossession(tokenAddress)) setPossessionOk(true);
  }, [tokenAddress]);

  const claimed = useQuery({
    queryKey: queryKeys.deviceAuth.claimed(tokenAddress),
    queryFn: () => fetchTokenClaimed(tokenAddress),
    enabled: Boolean(token) && (possessionOk || Boolean(session.data)),
    ...queryOptions.deviceLinks,
  });

  const isOwner = Boolean(session.data) && linkStatus.data === "linked_here";
  const unlocked = Boolean(token) && (isOwner || possessionOk);

  const role: WalletRole = isOwner ? "owner" : "visitor";

  const layout: ShellLayout =
    unlocked && token ? layoutForToken(token) : "compact";
  const waitingToken =
    !hydrated ||
    isRestoring ||
    (!token &&
      (tokenQuery.isPending ||
        tokenQuery.isLoading ||
        tokenQuery.isFetching));
  // Wait for session before Hold so linked owners don’t flash the gate.
  const waitingSession =
    Boolean(token) &&
    session.isPending &&
    !possessionOk &&
    !unlocked;
  // Only wait on link-status when sessioned (owner fast-path); never block Hold.
  const waitingLink =
    Boolean(token) &&
    Boolean(session.data) &&
    linkStatus.isPending &&
    !unlocked &&
    !possessionOk;
  // Wait briefly for claimed so claim sheet doesn’t flash after wallet.
  const waitingClaimed =
    unlocked &&
    !isOwner &&
    claimed.isPending &&
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
    waitingToken ||
    waitingSession ||
    waitingLink ||
    (waitingClaimed && !claimedWaitTimedOut);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [waiting]);

  return (
    <TokenRouteShell layout={layout}>
      {unlocked && token ? (
        renderHome({
          token,
          role,
          linkStatus: session.data ? linkStatus.data : undefined,
          claimed: claimed.isError
            ? undefined
            : claimed.data === undefined
              ? undefined
              : claimed.data,
        })
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
          onPossessed={() => setPossessionOk(true)}
        />
      ) : (
        <GateMessage
          icon={<Nfc className="size-5 text-muted-foreground" />}
          title={timedOut ? copy.verify.loadTimedOut : copy.token.itemLoadFailed}
          body={
            timedOut
              ? copy.verify.loadTimedOutBody
              : toUserErrorMessage(
                  tokenQuery.error,
                  copy.token.itemNotOnChain,
                )
          }
          action={
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                setTimedOut(false);
                void tokenQuery.refetch();
                if (session.data) void linkStatus.refetch();
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
  onPossessed,
}: {
  token: PhygitalToken;
  tokenAddress: string;
  onPossessed: () => void;
}) {
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint);
  const accessory = useAccessoryHold();

  async function holdToOpen() {
    const auth = await accessory.hold({
      expectedPublicKey: token.secp256r1PublicKey,
    });
    if (!auth) return;
    try {
      const pda = String(await findPhygitalTokenPda(auth.secp256r1PublicKey));
      if (pda !== tokenAddress) {
        throw new Error(copy.token.wrongItem);
      }
      storeAccessoryProof(tokenAddress, {
        message: auth.message,
        response: auth.response,
      });
      onPossessed();
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
