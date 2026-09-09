"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { UsernameSetupForm } from "@/components/home/username-setup-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
import { copy } from "@/lib/copy/phygital";
import { queryKeys, queryOptions } from "@/lib/queries";
import { QueryHttpError } from "@/lib/queries/http";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  fetchDeviceSession,
  fetchTokenGate,
  linkToken,
  loginDevice,
  registerDevice,
  type DeviceLink,
  type LinkStatus,
  type TokenGate,
} from "@/lib/wallet/device-auth-client";
import { dismissClaim } from "@/lib/wallet/claim-setup-href";

const SUCCESS_AUTO_MS = 1_600;

function platformAuthAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

/** Full-screen claim ceremony — passkey then platform WebAuthn link. */
export function ClaimItemSheet({
  phygitalTokenPda,
  onClaimed,
  onDismiss,
}: {
  phygitalTokenPda: string;
  onClaimed: () => void;
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [enteredWithSession, setEnteredWithSession] = useState<boolean | null>(
    null,
  );
  const canAuth = platformAuthAvailable();
  const onClaimedRef = useRef(onClaimed);
  const onDismissRef = useRef(onDismiss);
  const finishedRef = useRef(false);
  onClaimedRef.current = onClaimed;
  onDismissRef.current = onDismiss;

  const session = useQuery({
    queryKey: queryKeys.deviceAuth.session(),
    queryFn: fetchDeviceSession,
    ...queryOptions.deviceSession,
  });

  useEffect(() => {
    if (session.isPending || enteredWithSession !== null) return;
    setEnteredWithSession(Boolean(session.data));
  }, [session.isPending, session.data, enteredWithSession]);

  function finishClaimed() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClaimedRef.current();
  }

  function exitLinkedElsewhere() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    queryClient.setQueryData(
      queryKeys.deviceAuth.linkStatus(phygitalTokenPda),
      "linked_elsewhere" as LinkStatus,
    );
    queryClient.setQueryData(
      queryKeys.deviceAuth.claimed(phygitalTokenPda),
      true,
    );
    dismissClaim(phygitalTokenPda);
    onDismissRef.current();
  }

  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => finishClaimed(), SUCCESS_AUTO_MS);
    return () => window.clearTimeout(id);
  }, [success]);

  async function afterSession(
    sessionInfo: NonNullable<Awaited<ReturnType<typeof fetchDeviceSession>>>,
  ) {
    queryClient.setQueryData(queryKeys.deviceAuth.session(), sessionInfo);
    const data = await fetchTokenGate(phygitalTokenPda);
    queryClient.setQueryData(queryKeys.deviceAuth.session(), data.session);
    queryClient.setQueryData(
      queryKeys.deviceAuth.browseUnlock(phygitalTokenPda),
      data.browseUnlocked,
    );
    queryClient.setQueryData(queryKeys.deviceAuth.gate(phygitalTokenPda), data);
    if (data.linkStatus) {
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(phygitalTokenPda),
        data.linkStatus,
      );
    }
    queryClient.setQueryData(
      queryKeys.deviceAuth.claimed(phygitalTokenPda),
      data.claimed,
    );
    if (data.linkStatus === "linked_elsewhere") {
      exitLinkedElsewhere();
    }
  }

  const signIn = useMutation({
    mutationFn: async () => {
      if (session.data) return session.data;
      return loginDevice();
    },
    onSuccess: afterSession,
  });

  const register = useMutation({
    mutationFn: async (username: string) => registerDevice(username),
    onSuccess: async (sessionInfo) => {
      setRegistering(false);
      await afterSession(sessionInfo);
    },
  });

  const claim = useMutation({
    mutationFn: async () => {
      try {
        await linkToken({ phygitalToken: phygitalTokenPda });
      } catch (e) {
        if (e instanceof QueryHttpError && e.code === "linked_elsewhere") {
          exitLinkedElsewhere();
          return;
        }
        throw e;
      }
    },
    onSuccess: async () => {
      if (finishedRef.current) return;
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(phygitalTokenPda),
        "linked_here" as LinkStatus,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.claimed(phygitalTokenPda),
        true,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.gate(phygitalTokenPda),
        (prev: TokenGate | undefined) =>
          prev
            ? {
                ...prev,
                linkStatus: "linked_here",
                claimed: true,
              }
            : prev,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.links(),
        (prev: DeviceLink[] | undefined) => {
          if (!prev) return prev;
          if (prev.some((l) => l.phygitalToken === phygitalTokenPda)) {
            return prev;
          }
          return [
            ...prev,
            {
              phygitalToken: phygitalTokenPda,
              label: null,
              imageUrl: null,
              mint: null,
              linkedAt: Date.now(),
            },
          ];
        },
      );
      setSuccess(true);
    },
  });

  function skip() {
    dismissClaim(phygitalTokenPda);
    onDismiss();
  }

  if (success) {
    return (
      <CeremonyShell>
        <NfcHoldStatus
          size="lg"
          pulsing={false}
          tone="success"
          title={copy.wallet.claimSuccessTitle}
          body={copy.wallet.claimSuccessBody}
          action={
            <Button type="button" size="lg" className="w-full" onClick={finishClaimed}>
              {copy.wallet.claimSuccessCta}
            </Button>
          }
        />
      </CeremonyShell>
    );
  }

  if (registering) {
    return (
      <CeremonyShell>
        <UsernameSetupForm
          eyebrow={copy.wallet.setupStepPasskey}
          title={copy.wallet.usernameTitle}
          body={copy.wallet.usernameBody}
          busy={register.isPending}
          error={
            register.error ? toUserErrorMessage(register.error) : null
          }
          onSubmit={(username) => {
            claim.reset();
            signIn.reset();
            register.mutate(username);
          }}
          onBack={() => {
            register.reset();
            setRegistering(false);
          }}
        />
      </CeremonyShell>
    );
  }

  const signedIn = Boolean(session.data);
  const busy =
    signIn.isPending || claim.isPending || session.isPending || register.isPending;
  const activeError = signedIn ? claim.error : signIn.error;
  const authError = activeError ? toUserErrorMessage(activeError) : null;
  const showRetry = Boolean(authError);
  const primaryLabel = showRetry
    ? copy.wallet.claimTryAgain
    : signedIn
      ? copy.wallet.homeLinkConfirmCta
      : copy.wallet.claimCta;
  const title = signedIn
    ? copy.wallet.homeLinkConfirmTitle
    : copy.wallet.claimTitle;
  const body = authError
    ? authError
    : claim.isPending
      ? copy.wallet.homeLinkConfirmPending
      : !canAuth
        ? copy.wallet.claimDesktopHint
        : signedIn
          ? copy.wallet.homeLinkConfirmBody
          : copy.wallet.claimBody;
  const stepLabel = !signedIn
    ? copy.wallet.setupStepPasskey
    : enteredWithSession === false
      ? copy.wallet.setupStepConfirm
      : null;

  return (
    <CeremonyShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="space-y-2">
          {stepLabel ? (
            <p className="text-eyebrow text-primary/80">{stepLabel}</p>
          ) : null}
          <h1 className="text-large-title tracking-tight">{title}</h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {canAuth ? (
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={busy}
              onClick={() => {
                if (signedIn) {
                  claim.mutate();
                  return;
                }
                claim.reset();
                register.reset();
                signIn.mutate();
              }}
            >
              {signIn.isPending || claim.isPending ? (
                <Spinner className="size-4" />
              ) : (
                primaryLabel
              )}
            </Button>
          ) : null}
          {!signedIn && canAuth ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full rounded-full"
              disabled={busy}
              onClick={() => {
                claim.reset();
                signIn.reset();
                register.reset();
                setRegistering(true);
              }}
            >
              <span className="text-muted-foreground">
                {copy.wallet.newPhoneHint}{" "}
                <span className="font-medium text-foreground">
                  {copy.wallet.setUpThisPhone}
                </span>
              </span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={skip}
          >
            {copy.wallet.claimNotNow}
          </Button>
        </div>
      </div>
    </CeremonyShell>
  );
}
