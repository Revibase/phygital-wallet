"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  linkToken,
  loginDevice,
  registerDevice,
  type LinkStatus,
} from "@/lib/wallet/device-auth-client";
import { dismissClaim } from "@/lib/wallet/claim-setup-href";

const SUCCESS_AUTO_MS = 1_600;

function platformAuthAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

async function ensureSession(
  existing: Awaited<ReturnType<typeof fetchDeviceSession>>,
  preferRegister: boolean,
): Promise<NonNullable<Awaited<ReturnType<typeof fetchDeviceSession>>>> {
  if (existing) return existing;
  if (preferRegister) {
    try {
      return await registerDevice();
    } catch {
      return await loginDevice();
    }
  }
  try {
    return await loginDevice();
  } catch (e) {
    if (e instanceof Error && /cancelled|not allowed/i.test(e.message)) {
      throw e;
    }
    return await registerDevice();
  }
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
  const [elsewhere, setElsewhere] = useState(false);
  const [success, setSuccess] = useState(false);
  const [preferRegister, setPreferRegister] = useState(false);
  const canAuth = platformAuthAvailable();
  const onClaimedRef = useRef(onClaimed);
  const finishedRef = useRef(false);
  onClaimedRef.current = onClaimed;

  const session = useQuery({
    queryKey: queryKeys.deviceAuth.session(),
    queryFn: fetchDeviceSession,
    ...queryOptions.deviceSession,
  });

  function finishClaimed() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClaimedRef.current();
  }

  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => finishClaimed(), SUCCESS_AUTO_MS);
    return () => window.clearTimeout(id);
  }, [success]);

  const claim = useMutation({
    mutationFn: async () => {
      const sessionInfo = await ensureSession(session.data ?? null, preferRegister);
      queryClient.setQueryData(queryKeys.deviceAuth.session(), sessionInfo);

      try {
        await linkToken({ phygitalToken: phygitalTokenPda });
      } catch (e) {
        if (e instanceof QueryHttpError && e.code === "linked_elsewhere") {
          setElsewhere(true);
        }
        throw e;
      }
    },
    onSuccess: async () => {
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(phygitalTokenPda),
        "linked_here" as LinkStatus,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.claimed(phygitalTokenPda),
        true,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.deviceAuth.all(),
      });
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

  if (elsewhere) {
    return (
      <CeremonyShell>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
          <h1 className="text-display-md tracking-tight">
            {copy.wallet.limitsLinkedElsewhereTitle}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {copy.wallet.limitsLinkedElsewhereBody}
          </p>
          <Button type="button" size="lg" variant="outline" onClick={onDismiss}>
            {copy.common.done}
          </Button>
        </div>
      </CeremonyShell>
    );
  }

  const authError = claim.error ? toUserErrorMessage(claim.error) : null;
  const showRetry = Boolean(authError);
  const signedIn = Boolean(session.data);
  const primaryLabel = showRetry
    ? copy.wallet.claimTryAgain
    : signedIn
      ? copy.wallet.claimContinue
      : copy.wallet.claimCta;

  return (
    <CeremonyShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="space-y-2">
          <p className="text-eyebrow text-primary/80">
            {signedIn
              ? copy.wallet.setupStepLink
              : copy.wallet.setupStepPasskey}
          </p>
          <h1 className="text-large-title tracking-tight">
            {copy.wallet.claimTitle}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {authError
              ? authError
              : !canAuth
                ? copy.wallet.claimDesktopHint
                : copy.wallet.claimBody}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {canAuth ? (
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={claim.isPending || session.isPending}
              onClick={() => {
                setPreferRegister(false);
                claim.mutate();
              }}
            >
              {claim.isPending ? (
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
              disabled={claim.isPending}
              onClick={() => {
                setPreferRegister(true);
                claim.mutate();
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
            disabled={claim.isPending}
            onClick={skip}
          >
            {copy.wallet.claimNotNow}
          </Button>
        </div>
      </div>
    </CeremonyShell>
  );
}
