"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { WalletRole } from "@/components/token/token-address-route";
import { useRecoveryWallet } from "@/hooks/wallet/use-recovery-wallet";
import { useTokenVerifier } from "@/hooks/wallet/use-token-verifier";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  unlinkToken,
  type LinkStatus,
} from "@/lib/wallet/device-auth-client";
import { redirectToClaimSetup, clearClaimDismiss } from "@/lib/wallet/claim-setup-href";
import { redirectToDeviceSignIn } from "@/lib/wallet/device-sign-in-href";
import { cn } from "@/lib/utils";
import { walletSettingsHref } from "@/lib/wallet/token-routes";

/** Access: link / unlink this phone (owners); claim path (visitors). */
export function AccessRecoverySheet({
  phygitalTokenPda,
  role,
  linkStatus,
  claimed,
  onBack,
  onOpenRecovery,
  onOpenSigning,
  onClaim,
  onUnlinked,
}: {
  phygitalTokenPda: string;
  role: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
  onBack: () => void;
  onOpenRecovery?: () => void;
  onOpenSigning?: () => void;
  onClaim?: () => void;
  onUnlinked?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const isOwner = role === "owner";
  const recovery = useRecoveryWallet(isOwner ? phygitalTokenPda : null);
  const verifier = useTokenVerifier(isOwner ? phygitalTokenPda : null);
  const linkedElsewhere = linkStatus === "linked_elsewhere";
  const claimedQuiet = claimed === true && !isOwner && !linkedElsewhere;
  const teardownLoading =
    isOwner && (recovery.isLoading || verifier.isLoading);
  /** Only surface when set — must clear before unlink. Managed in Safety otherwise. */
  const needsRecoveryClear = Boolean(recovery.data?.configured);
  const needsSigningRestore = Boolean(verifier.data?.custom);
  const showUnlinkBlockers =
    isOwner &&
    !teardownLoading &&
    (needsRecoveryClear || needsSigningRestore);
  const canUnlink =
    isOwner &&
    !teardownLoading &&
    !needsRecoveryClear &&
    !needsSigningRestore;
  const accessReturnTo = walletSettingsHref(phygitalTokenPda, "access");

  async function unlink() {
    if (!canUnlink) return;
    setBusy(true);
    try {
      await unlinkToken(phygitalTokenPda);
      clearClaimDismiss(phygitalTokenPda);
      queryClient.setQueryData(
        queryKeys.deviceAuth.linkStatus(phygitalTokenPda),
        "unlinked" as LinkStatus,
      );
      queryClient.setQueryData(
        queryKeys.deviceAuth.claimed(phygitalTokenPda),
        false,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.deviceAuth.all(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.walletPolicy.all(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.recoveryWallet.byToken(phygitalTokenPda),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tokenVerifier.byToken(phygitalTokenPda),
        }),
      ]);
      toast.success(copy.wallet.deviceUnlinked);
      onUnlinked?.();
    } catch (e) {
      toast.error(toUserErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirmUnlink(false);
    }
  }

  if (confirmUnlink) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={<NavBarBack onClick={() => setConfirmUnlink(false)} />}
          title={copy.wallet.deviceUnlinkConfirmTitle}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {copy.wallet.deviceUnlinkConfirmBody}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={busy}
            onClick={() => void unlink()}
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              copy.wallet.deviceUnlinkConfirmCta
            )}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmUnlink(false)}
          >
            {copy.wallet.deviceUnlinkConfirmCancel}
          </Button>
        </div>
      </div>
    );
  }

  const visitorTitle = linkedElsewhere
    ? copy.wallet.limitsLinkedElsewhereTitle
    : claimedQuiet
      ? copy.wallet.claimSignInTitle
      : copy.wallet.claimTitle;
  const visitorHint = linkedElsewhere || claimedQuiet
    ? null
    : copy.wallet.accessClaimHint;
  const visitorBody = linkedElsewhere
    ? copy.wallet.limitsLinkedElsewhereBody
    : claimedQuiet
      ? copy.wallet.claimSignInBody
      : copy.wallet.deviceLinkBody;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={isOwner ? copy.wallet.accessAndRecovery : visitorTitle}
      />
      <div className="space-y-2 px-1">
        {isOwner || visitorHint ? (
          <p className="text-sm font-medium">
            {isOwner ? copy.wallet.accessAndRecoveryHint : visitorHint}
          </p>
        ) : null}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isOwner ? copy.wallet.accessAndRecoveryBody : visitorBody}
        </p>
      </div>

      {showUnlinkBlockers ? (
        <GroupedList
          label={copy.wallet.deviceUnlinkBefore}
          footer={copy.wallet.deviceUnlinkBlockersFooter}
        >
          {needsRecoveryClear ? (
            <TeardownStep
              label={copy.wallet.accessRecoveryRow}
              onAction={onOpenRecovery}
              actionLabel={copy.wallet.deviceUnlinkClearRecoveryCta}
            />
          ) : null}
          {needsSigningRestore ? (
            <TeardownStep
              label={copy.wallet.signing}
              onAction={onOpenSigning}
              actionLabel={copy.wallet.deviceUnlinkRestoreSigningCta}
            />
          ) : null}
        </GroupedList>
      ) : null}

      <div className="flex flex-col gap-2">
        {isOwner && canUnlink ? (
          <p className="text-xs text-muted-foreground">
            {copy.wallet.deviceUnlinkPolicyWarn}
          </p>
        ) : null}
        {isOwner && teardownLoading ? (
          <Button type="button" size="lg" className="w-full" disabled>
            <Spinner className="size-4" />
          </Button>
        ) : isOwner && canUnlink ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setConfirmUnlink(true)}
          >
            {copy.wallet.deviceUnlink}
          </Button>
        ) : isOwner ? null : linkedElsewhere ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            onClick={onBack}
          >
            {copy.common.done}
          </Button>
        ) : claimedQuiet ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() =>
              redirectToDeviceSignIn(phygitalTokenPda, accessReturnTo)
            }
          >
            {copy.wallet.claimCta}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => {
              if (onClaim) onClaim();
              else redirectToClaimSetup(phygitalTokenPda, accessReturnTo);
            }}
          >
            {copy.wallet.claimBannerAction}
          </Button>
        )}
      </div>
    </div>
  );
}

function TeardownStep({
  label,
  onAction,
  actionLabel,
}: {
  label: string;
  onAction?: () => void;
  actionLabel: string;
}) {
  return (
    <GroupedRow
      onClick={onAction}
      subtitle={
        <span className="flex w-full items-center justify-between gap-2">
          <span className={cn("text-foreground")}>
            {copy.wallet.deviceUnlinkStepNeeded}
          </span>
          {onAction ? (
            <span className="text-xs font-medium text-foreground">
              {actionLabel}
            </span>
          ) : null}
        </span>
      }
    >
      {label}
    </GroupedRow>
  );
}
