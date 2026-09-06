"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { findPhygitalTokenPda } from "phygital-token-sdk";

import { AppShell } from "@/components/layout/app-shell";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { LoadingStatus } from "@/components/shared/loading-status";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { copy } from "@/lib/copy/phygital";
import { homeSectionsClass, touchTargetClass } from "@/lib/layout";
import { queryKeys, queryOptions } from "@/lib/queries";
import { galleryAnimate } from "@/lib/motion";
import { cn, shortAddress } from "@/lib/utils";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  fetchDeviceLinks,
  fetchDeviceSession,
  fetchLinkStatus,
  linkToken,
  loginDevice,
  registerDevice,
  unlockBrowseFromAccessory,
  type DeviceLink,
  type LinkStatus,
} from "@/lib/wallet/device-auth-client";
import { authenticateToken } from "@/lib/token/authenticate";
import { parseClaimSetupIntent } from "@/lib/wallet/claim-setup-href";
import { parseLimitsSetupIntent } from "@/lib/wallet/limits-setup-href";
import { tokenHref, walletHref } from "@/lib/wallet/token-routes";

/** Home: signed-out passkey door, or signed-in linked items (+ setup intent). */
export function OwnedHome() {
  return (
    <AppShell layout="home">
      <OwnedHomeRoot />
    </AppShell>
  );
}

function OwnedHomeRoot() {
  const searchParams = useSearchParams();
  const limitsIntent = parseLimitsSetupIntent({
    setup: searchParams.get("setup"),
    returnPath: searchParams.get("return"),
  });
  const claimIntent = parseClaimSetupIntent({
    setup: searchParams.get("setup"),
    returnPath: searchParams.get("return"),
  });
  const setupIntent = claimIntent ?? limitsIntent;
  const setupMode = Boolean(setupIntent);

  const session = useQuery({
    queryKey: queryKeys.deviceAuth.session(),
    queryFn: fetchDeviceSession,
    ...queryOptions.deviceSession,
  });

  if (session.isPending) {
    return <LoadingStatus />;
  }

  if (!session.data) {
    return (
      <HomePasskeyScreen
        setupMode={setupMode}
        claimMode={Boolean(claimIntent)}
      />
    );
  }

  if (setupIntent) {
    return (
      <HomeLinkSetup
        tokenAddress={setupIntent.token}
        returnTo={setupIntent.returnTo}
        claimMode={Boolean(claimIntent)}
      />
    );
  }

  return <HomeLinksScreen />;
}

function HomePasskeyScreen({
  setupMode,
  claimMode,
}: {
  setupMode: boolean;
  claimMode: boolean;
}) {
  const queryClient = useQueryClient();

  function onAuthSuccess(next: Awaited<ReturnType<typeof loginDevice>>) {
    queryClient.setQueryData(queryKeys.deviceAuth.session(), next);
    void queryClient.prefetchQuery({
      queryKey: queryKeys.deviceAuth.links(),
      queryFn: fetchDeviceLinks,
      ...queryOptions.deviceLinks,
    });
  }

  const loginMutation = useMutation({
    mutationFn: loginDevice,
    onSuccess: onAuthSuccess,
  });
  const registerMutation = useMutation({
    mutationFn: registerDevice,
    onSuccess: onAuthSuccess,
  });

  const busy = loginMutation.isPending || registerMutation.isPending;
  const authError = loginMutation.error ?? registerMutation.error;

  return (
    <CeremonyShell>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="relative z-10 space-y-2">
          {setupMode ? (
            <p className="text-eyebrow text-primary/80">
              {copy.wallet.setupStepPasskey}
            </p>
          ) : null}
          <h1 className="text-large-title tracking-tight">
            {setupMode
              ? claimMode
                ? copy.wallet.homeSetupPasskeyClaimTitle
                : copy.wallet.limitsSetupTitle
              : copy.wallet.deviceLoginTitle}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {authError
              ? toUserErrorMessage(authError)
              : setupMode
                ? copy.wallet.homeSetupPasskeyBody
                : copy.wallet.deviceLoginBody}
          </p>
        </div>
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={() => {
              registerMutation.reset();
              loginMutation.mutate();
            }}
          >
            {loginMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              copy.wallet.continueWithPasskey
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={() => {
              loginMutation.reset();
              registerMutation.mutate();
            }}
          >
            {registerMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <span className="text-muted-foreground">
                {copy.wallet.newPhoneHint}{" "}
                <span className="font-medium text-foreground">
                  {copy.wallet.setUpThisPhone}
                </span>
              </span>
            )}
          </Button>
          {!setupMode ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full rounded-full"
              asChild
            >
              <a href="/token">{copy.wallet.homeHaveItemHint}</a>
            </Button>
          ) : null}
        </div>
      </div>
    </CeremonyShell>
  );
}

function HomeLinkSetup({
  tokenAddress,
  returnTo,
  claimMode,
}: {
  tokenAddress: string;
  returnTo: string;
  claimMode: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: queryKeys.deviceAuth.linkStatus(tokenAddress),
    queryFn: () => fetchLinkStatus(tokenAddress),
    ...queryOptions.deviceLinks,
  });

  useEffect(() => {
    if (status.data === "linked_here") {
      router.replace(returnTo);
    }
  }, [status.data, router, returnTo]);

  const link = useMutation({
    mutationFn: async () => {
      const auth = await authenticateToken();
      const pda = String(await findPhygitalTokenPda(auth.secp256r1PublicKey));
      if (pda !== tokenAddress) {
        throw new Error(copy.token.wrongItem);
      }
      await unlockBrowseFromAccessory({
        message: auth.message,
        response: auth.response,
        phygitalToken: tokenAddress,
      });
      await linkToken({ phygitalToken: tokenAddress });
    },
    onSuccess: async () => {
      queryClient.setQueryData(
        queryKeys.deviceAuth.browseUnlock(tokenAddress),
        true,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(tokenAddress),
        "linked_here" as LinkStatus,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.claimed(tokenAddress),
        true,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.deviceAuth.links(),
      });
      router.replace(returnTo);
    },
  });

  if (status.isPending || status.data === "linked_here") {
    return <LoadingStatus />;
  }

  if (status.data === "linked_elsewhere") {
    return (
      <CeremonyShell>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {copy.wallet.setupStepLink}
          </p>
          <h1 className="text-display-md tracking-tight">
            {copy.wallet.limitsLinkedElsewhereTitle}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {copy.wallet.limitsLinkedElsewhereBody}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.push("/")}
          >
            {copy.common.done}
          </Button>
        </div>
      </CeremonyShell>
    );
  }

  const error = link.error ? toUserErrorMessage(link.error) : null;

  if (link.isPending) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing
          busy
          title={copy.verify.holdStill}
          body={copy.verify.holdStillBody}
        />
      </CeremonyShell>
    );
  }

  return (
    <CeremonyShell
      leading={
        <p className="px-4 pt-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {copy.wallet.setupStepLink}
        </p>
      }
    >
      <NfcHoldStatus
        size="lg"
        pulsing={!error}
        title={error ? copy.verify.failed : copy.wallet.homeLinkSetupTitle}
        body={error ?? copy.wallet.homeLinkSetupBody}
        action={
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => link.mutate()}
          >
            {error
              ? copy.common.tryAgain
              : claimMode
                ? copy.wallet.claimHoldToContinue
                : copy.wallet.deviceLinkCta}
          </Button>
        }
      />
    </CeremonyShell>
  );
}

function HomeLinksScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const links = useQuery({
    queryKey: queryKeys.deviceAuth.links(),
    queryFn: fetchDeviceLinks,
    ...queryOptions.deviceLinks,
  });

  const addAccessory = useMutation({
    mutationFn: async () => {
      const auth = await authenticateToken();
      const pda = String(await findPhygitalTokenPda(auth.secp256r1PublicKey));
      await unlockBrowseFromAccessory({
        message: auth.message,
        response: auth.response,
        phygitalToken: pda,
      });
      await linkToken({ phygitalToken: pda });
      queryClient.setQueryData(
        queryKeys.deviceAuth.browseUnlock(pda),
        true,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(pda),
        "linked_here" as const,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.links(),
        (prev: DeviceLink[] | undefined) => {
          if (!prev) return prev;
          if (prev.some((l) => l.phygitalToken === pda)) return prev;
          return [
            ...prev,
            {
              phygitalToken: pda,
              label: null,
              imageUrl: null,
              mint: null,
              linkedAt: Date.now(),
            },
          ];
        },
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deviceAuth.links(),
      });
      return pda;
    },
    onSuccess: (pda) => {
      router.push(walletHref(pda));
    },
  });

  if (addAccessory.isPending) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing
          busy
          progress
          title={copy.home.holdTitle}
          body={copy.home.holdBody}
        />
      </CeremonyShell>
    );
  }

  if (links.isLoading) {
    return <LoadingStatus />;
  }

  const items = links.data ?? [];
  const error = addAccessory.error
    ? toUserErrorMessage(addAccessory.error)
    : null;

  if (items.length === 0) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing={false}
          title={copy.home.emptyTitle}
          body={error ?? copy.home.emptyBody}
          action={
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => addAccessory.mutate()}
            >
              {copy.wallet.deviceAddAccessory}
            </Button>
          }
        />
      </CeremonyShell>
    );
  }

  const cards = items.filter((item) => Boolean(item.mint));
  const accessories = items.filter((item) => !item.mint);
  const bothKinds = cards.length > 0 && accessories.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-large-title tracking-tight">{copy.home.keysTitle}</h1>
        <Button
          type="button"
          variant="outline"
          size="default"
          className={cn(touchTargetClass, "rounded-full")}
          onClick={() => addAccessory.mutate()}
        >
          {copy.wallet.deviceAddAccessory}
        </Button>
      </div>

      {error ? (
        <p className="px-1 text-sm text-muted-foreground">{error}</p>
      ) : null}

      <div
        className={cn(
          galleryAnimate.rise,
          bothKinds ? homeSectionsClass : "flex flex-col gap-6",
        )}
      >
        {cards.length > 0 ? (
          <FormFactorSection
            label={copy.home.cards}
            items={cards}
            onOpen={(token) => router.push(tokenHref(token))}
          />
        ) : null}
        {accessories.length > 0 ? (
          <FormFactorSection
            label={copy.home.accessories}
            items={accessories}
            onOpen={(token) => router.push(walletHref(token))}
          />
        ) : null}
      </div>
    </div>
  );
}

function FormFactorSection({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: DeviceLink[];
  onOpen: (phygitalToken: string) => void;
}) {
  return (
    <GroupedList label={label}>
      {items.map((item) => {
        const kind = item.mint ? copy.home.card : copy.home.accessory;
        const name = item.label?.trim() || kind;
        return (
          <GroupedRow
            key={item.phygitalToken}
            onClick={() => onOpen(item.phygitalToken)}
            leading={
              item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-xs font-medium text-muted-foreground"
                  aria-hidden
                >
                  {(name.trim().charAt(0) || "?").toUpperCase()}
                </span>
              )
            }
            subtitle={shortAddress(item.phygitalToken, 4)}
          >
            {name}
          </GroupedRow>
        );
      })}
    </GroupedList>
  );
}
