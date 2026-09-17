"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { TokenIcon } from "@/components/shared/token-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  ProgramPermissionView,
  SpendCapView,
  WalletPolicyView,
} from "@/hooks/token/use-wallet-policy";
import { useClearWalletPolicy } from "@/hooks/token/use-clear-wallet-policy";
import { useSetWalletPolicy } from "@/hooks/token/use-set-wallet-policy";
import { useVerifiedTokens } from "@/hooks/wallet/use-verified-tokens";
import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { formatTokenAmount } from "@/lib/tokens/amount";
import type { PaymentToken } from "@/lib/tokens/payment-token";
import { NATIVE_SOL_MINT, SOL_ICON_URL } from "@/lib/tokens/payment-token";
import {
  lamportsToSol,
  nextResetDate,
  windowPhrase,
} from "@/lib/wallet/policy-format";
import { walletClaimHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

/**
 * Screen Time–style status: mode title, one supporting line, content by mode,
 * one primary action, quiet secondary under More.
 */
export function PolicyStatusView({
  phygitalTokenPda,
  data,
  loading,
  isOwner,
  isSignedIn,
  isClaimed,
  onEdit,
}: {
  phygitalTokenPda: string;
  data: WalletPolicyView | undefined;
  loading: boolean;
  isOwner: boolean;
  isSignedIn: boolean;
  isClaimed: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const status = data?.status ?? "none";

  function goClaim() {
    router.push(walletClaimHref(phygitalTokenPda));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-1">
        <Skeleton className="h-9 w-48 rounded" />
        <Skeleton className="h-4 w-64 rounded" />
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="flex flex-col gap-6">
        <ModeHeader
          title={copy.wallet.policyStatusLocked}
          body={copy.wallet.policyStatusLockedBody}
        />
        {!isClaimed ? (
          <Button type="button" size="lg" className="w-full" onClick={goClaim}>
            {isSignedIn
              ? copy.wallet.policyLockedClaimCta
              : copy.wallet.authoritySignInCta}
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === "open") {
    return (
      <div className="flex flex-col gap-6">
        <ModeHeader
          title={copy.wallet.policyStatusOpen}
          body={copy.wallet.policyStatusOpenBody}
          warn
        />
        {isOwner ? (
          <RestoreEverydayPrimary phygitalTokenPda={phygitalTokenPda} />
        ) : !isSignedIn ? (
          <PolicySignInCta />
        ) : null}
      </div>
    );
  }

  if (status === "limited") {
    return (
      <div className="flex flex-col gap-6">
        <ModeHeader
          title={copy.wallet.policyStatusLimited}
          body={copy.wallet.policyStatusLimitedBody}
        />
        <LimitedCaps
          solCap={data?.solCap ?? null}
          mintCaps={data?.mintCaps ?? []}
          programPermissions={data?.programPermissions ?? []}
        />
        {isOwner ? (
          <>
            <Button type="button" size="lg" className="w-full" onClick={onEdit}>
              {copy.wallet.policyEdit}
            </Button>
            <PolicyMoreSection
              phygitalTokenPda={phygitalTokenPda}
              showRestore
              showTurnOff
            />
          </>
        ) : !isSignedIn ? (
          <PolicySignInCta />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ModeHeader
        title={copy.wallet.policyStatusStandard}
        body={copy.wallet.policyStatusStandardBody}
      />
      {isOwner ? (
        <>
          <Button type="button" size="lg" className="w-full" onClick={onEdit}>
            {copy.wallet.policySet}
          </Button>
          <PolicyMoreSection phygitalTokenPda={phygitalTokenPda} showTurnOff />
        </>
      ) : !isSignedIn ? (
        <PolicySignInCta />
      ) : null}
    </div>
  );
}

function ModeHeader({
  title,
  body,
  warn = false,
}: {
  title: string;
  body: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2
        className={cn(
          "text-large-title tracking-tight",
          warn && "text-destructive",
        )}
      >
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/** Same continue-on-this-phone unlock as ownership — button triggers owner login. */
function PolicySignInCta() {
  const { login } = useOwnerWallet();
  const [signingIn, setSigningIn] = useState(false);

  async function signInHere() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await login();
    } catch (err) {
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-sm text-muted-foreground">
        {copy.wallet.policySignInToEdit}
      </p>
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={signingIn}
        onClick={() => void signInHere()}
      >
        {signingIn ? (
          <Spinner className="size-4" />
        ) : (
          copy.wallet.ownershipSignIn
        )}
      </Button>
    </div>
  );
}

function LimitedCaps({
  solCap,
  mintCaps,
  programPermissions,
}: {
  solCap: SpendCapView | null;
  mintCaps: (SpendCapView & { mint: string })[];
  programPermissions: ProgramPermissionView[];
}) {
  const tokens = useVerifiedTokens();
  const byMint = useMemo(() => indexByMint(tokens.data ?? []), [tokens.data]);
  const hasAssets = Boolean(solCap) || mintCaps.length > 0;

  return (
    <div className="flex flex-col gap-4 px-1">
      {hasAssets ? (
        <GroupedList label={copy.wallet.policyTokenLimits}>
          {solCap ? (
            <GroupedRow
              leading={
                <TokenIcon
                  token={{
                    mint: NATIVE_SOL_MINT,
                    symbol: copy.wallet.policySolLabel,
                    icon: SOL_ICON_URL,
                  }}
                  className="size-8"
                />
              }
              subtitle={capRemainingLabel(
                lamportsToSol(solCap.remaining),
                copy.wallet.policySolLabel,
                solCap.lastReset,
                solCap.windowSeconds,
              )}
              trailing={
                <span className="text-sm tabular-nums text-muted-foreground">
                  {lamportsToSol(solCap.cap)} {copy.wallet.policySolLabel}
                </span>
              }
            >
              {copy.wallet.policySolLabel}
            </GroupedRow>
          ) : null}
          {mintCaps.map((m) => {
            const token = byMint.get(m.mint);
            const decimals = token?.decimals ?? null;
            const symbol = token?.symbol ?? shortAddress(m.mint);
            const amount =
              decimals != null ? formatTokenAmount(m.cap, decimals) : null;
            const remaining =
              decimals != null
                ? formatTokenAmount(m.remaining, decimals)
                : null;
            const reset = nextResetDate(m.lastReset, m.windowSeconds);
            return (
              <GroupedRow
                key={m.mint}
                leading={
                  <TokenIcon
                    token={{
                      mint: m.mint,
                      symbol: token?.symbol ?? "",
                      icon: token?.icon ?? null,
                    }}
                    className="size-8"
                  />
                }
                subtitle={
                  remaining != null
                    ? capRemainingLabel(
                        remaining,
                        symbol,
                        m.lastReset,
                        m.windowSeconds,
                      )
                    : reset
                    ? copy.wallet.policyResetsOn(reset)
                    : copy.wallet.policyNoReset
                }
                trailing={
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {amount != null
                      ? `${amount} ${symbol}`.trim()
                      : shortAddress(m.mint)}
                  </span>
                }
              >
                {symbol}
              </GroupedRow>
            );
          })}
        </GroupedList>
      ) : null}

      {programPermissions.length > 0 ? (
        <GroupedList label={copy.wallet.policyAdvanced}>
          {programPermissions.map((p) => (
            <GroupedRow
              key={p.programId}
              trailing={
                <span
                  className={cn(
                    "text-sm",
                    p.kind === "deny" && "text-destructive",
                  )}
                >
                  {p.kind === "allow"
                    ? copy.wallet.policyAccessAllow
                    : p.kind === "deny"
                    ? copy.wallet.policyAccessDeny
                    : copy.wallet.policyAccessCustom}
                </span>
              }
            >
              <span className="font-mono text-xs">
                {shortAddress(p.programId, 6)}
              </span>
            </GroupedRow>
          ))}
        </GroupedList>
      ) : null}
    </div>
  );
}

function PolicyMoreSection({
  phygitalTokenPda,
  showRestore = false,
  showTurnOff = false,
}: {
  phygitalTokenPda: string;
  showRestore?: boolean;
  showTurnOff?: boolean;
}) {
  const setPolicy = useSetWalletPolicy(phygitalTokenPda);
  const clear = useClearWalletPolicy(phygitalTokenPda);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [turnOffOpen, setTurnOffOpen] = useState(false);

  return (
    <>
      <GroupedList label={copy.wallet.policyMore}>
        {showRestore ? (
          <GroupedRow onClick={() => setRestoreOpen(true)}>
            {copy.wallet.policyRestore}
          </GroupedRow>
        ) : null}
        {showTurnOff ? (
          <GroupedRow
            destructive
            onClick={() => setTurnOffOpen(true)}
          >
            {copy.wallet.policyTurnOff}
          </GroupedRow>
        ) : null}
      </GroupedList>

      <Dialog
        open={restoreOpen}
        onOpenChange={(next) => {
          if (!setPolicy.isPending) setRestoreOpen(next);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.wallet.policyRestoreConfirmTitle}</DialogTitle>
            <DialogDescription>
              {copy.wallet.policyRestoreConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full sm:w-auto"
                disabled={setPolicy.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              className="w-full rounded-full sm:w-auto"
              disabled={setPolicy.isPending}
              onClick={() =>
                setPolicy.mutate(
                  {
                    solCap: null,
                    mintCaps: [],
                    programPermissions: [],
                  },
                  {
                    onSuccess: () => {
                      toast.success(copy.wallet.policyRestored);
                      setRestoreOpen(false);
                    },
                    onError: (err) => toast.error(toUserErrorMessage(err)),
                  },
                )
              }
            >
              {setPolicy.isPending ? "…" : copy.wallet.policyRestore}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={turnOffOpen}
        onOpenChange={(next) => {
          if (!clear.isPending) setTurnOffOpen(next);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.wallet.policyTurnOffConfirmTitle}</DialogTitle>
            <DialogDescription>
              {copy.wallet.policyTurnOffConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full sm:w-auto"
                disabled={clear.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="w-full rounded-full sm:w-auto"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(copy.wallet.policyTurnedOff);
                    setTurnOffOpen(false);
                  },
                  onError: (err) => toast.error(toUserErrorMessage(err)),
                })
              }
            >
              {clear.isPending ? "…" : copy.wallet.policyTurnOff}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RestoreEverydayPrimary({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const setPolicy = useSetWalletPolicy(phygitalTokenPda);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {copy.wallet.policyRestore}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!setPolicy.isPending) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.wallet.policyRestoreConfirmTitle}</DialogTitle>
            <DialogDescription>
              {copy.wallet.policyRestoreConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full sm:w-auto"
                disabled={setPolicy.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              className="w-full rounded-full sm:w-auto"
              disabled={setPolicy.isPending}
              onClick={() =>
                setPolicy.mutate(
                  {
                    solCap: null,
                    mintCaps: [],
                    programPermissions: [],
                  },
                  {
                    onSuccess: () => {
                      toast.success(copy.wallet.policyRestored);
                      setOpen(false);
                    },
                    onError: (err) => toast.error(toUserErrorMessage(err)),
                  },
                )
              }
            >
              {setPolicy.isPending ? "…" : copy.wallet.policyRestore}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function capRemainingLabel(
  amount: string,
  symbol: string,
  lastReset: bigint,
  windowSeconds: bigint,
): string {
  const reset = nextResetDate(lastReset, windowSeconds);
  return reset
    ? copy.wallet.policyLeftUntil(amount, symbol, reset)
    : copy.wallet.policyLeftLifetime(amount, symbol);
}

function indexByMint(tokens: PaymentToken[]): Map<string, PaymentToken> {
  return new Map(tokens.map((t) => [t.mint, t]));
}

/** Settings hub subtitle for limited mode — prefer SOL/week when SOL-only. */
export function policyHubLimitedSubtitle(data: WalletPolicyView): string {
  const sol = data.solCap;
  const mints = data.mintCaps;
  if (sol && mints.length === 0) {
    const window = windowPhrase(sol.windowSeconds).replace(/^every /, "");
    return copy.wallet.policyHubLimited(
      `${lamportsToSol(sol.cap)} SOL / ${window}`,
    );
  }
  const count = mints.length + (sol ? 1 : 0);
  return copy.wallet.policyHubLimited(copy.wallet.policyAssetsSummary(count));
}
