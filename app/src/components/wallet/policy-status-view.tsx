"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Ban, Check, Infinity as InfinityIcon, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { StatusPill } from "@/components/shared/status-pill";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  ProgramPermissionView,
  SpendCapView,
  WalletPolicyStatus,
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
  POLICY_BASELINE_CAPABILITIES,
  labelProgramId,
} from "@/lib/wallet/policy-baseline";
import {
  lamportsToSol,
  nextResetDate,
  windowPhrase,
} from "@/lib/wallet/policy-format";
import { walletClaimHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

/**
 * Screen Time–style status: compact mode title + status chip, then an
 * allow/block capability matrix so a new user can scan what’s executable
 * in under five seconds.
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
        <Skeleton className="h-8 w-52 rounded" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="flex flex-col gap-6">
        <ModeHeader status="none" />
        <PermissionMatrix status="none" />
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
        <ModeHeader status="open" />
        <PermissionMatrix status="open" />
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
        <ModeHeader status="limited" />
        <PermissionMatrix
          status="limited"
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
      <ModeHeader status="standard" />
      <PermissionMatrix status="standard" />
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

function ModeHeader({ status }: { status: WalletPolicyStatus }) {
  const meta = MODE_META[status];
  return (
    <div className="flex items-start justify-between gap-3 px-1">
      <h2
        className={cn(
          "text-display-md tracking-tight",
          status === "open" && "text-destructive",
        )}
      >
        {meta.title}
      </h2>
      <StatusPill
        label={meta.chip}
        tone={meta.tone}
        className="mt-1 shrink-0"
        role="status"
      />
    </div>
  );
}

const MODE_META: Record<
  WalletPolicyStatus,
  {
    title: string;
    chip: string;
    tone: "success" | "accent" | "danger" | "neutral";
  }
> = {
  standard: {
    title: copy.wallet.policyStatusStandard,
    chip: copy.wallet.policyChipProtected,
    tone: "success",
  },
  limited: {
    title: copy.wallet.policyStatusLimited,
    chip: copy.wallet.policyChipLimited,
    tone: "accent",
  },
  open: {
    title: copy.wallet.policyStatusOpen,
    chip: copy.wallet.policyChipOff,
    tone: "danger",
  },
  none: {
    title: copy.wallet.policyStatusLocked,
    chip: copy.wallet.policyChipLocked,
    tone: "neutral",
  },
};

type CapabilityState = "allow" | "block" | "warn";

function CapabilityGlyph({ state }: { state: CapabilityState }) {
  if (state === "allow") {
    return (
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/12 text-success"
        aria-hidden
      >
        <Check className="size-3.5 stroke-[2.5]" />
      </span>
    );
  }
  if (state === "warn") {
    return (
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive"
        aria-hidden
      >
        <TriangleAlert className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      aria-hidden
    >
      <Ban className="size-3.5" />
    </span>
  );
}

function CapabilityRow({
  state,
  label,
  detail,
  trailing,
}: {
  state: CapabilityState;
  label: string;
  detail?: string;
  trailing?: ReactNode;
}) {
  return (
    <GroupedRow
      leading={<CapabilityGlyph state={state} />}
      subtitle={detail}
      trailing={trailing}
    >
      <span
        className={cn(
          state === "block" && "text-muted-foreground",
          state === "warn" && "text-destructive",
        )}
      >
        {label}
      </span>
    </GroupedRow>
  );
}

/**
 * Glanceable allow/block matrix. Primary answer to “what can this accessory
 * execute right now?” — visual glyphs carry status; Solana program names are
 * secondary labels for knowledgeable users.
 */
function PermissionMatrix({
  status,
  solCap = null,
  mintCaps = [],
  programPermissions = [],
}: {
  status: WalletPolicyStatus;
  solCap?: SpendCapView | null;
  mintCaps?: (SpendCapView & { mint: string })[];
  programPermissions?: ProgramPermissionView[];
}) {
  if (status === "none") {
    return (
      <GroupedList label={copy.wallet.policyMatrixBlocked}>
        <CapabilityRow
          state="block"
          label={copy.wallet.policyMatrixAllTx}
          detail={copy.wallet.policyStatusLockedBody}
        />
      </GroupedList>
    );
  }

  if (status === "open") {
    return (
      <div className="flex flex-col gap-4">
        <GroupedList label={copy.wallet.policyMatrixAllowed}>
          <CapabilityRow
            state="warn"
            label={copy.wallet.policyMatrixAnyProgram}
          />
          <CapabilityRow
            state="warn"
            label={copy.wallet.policyMatrixAnyAmount}
          />
          <CapabilityRow
            state="warn"
            label={copy.wallet.policyMatrixNoChecks}
          />
        </GroupedList>
      </div>
    );
  }

  if (status === "limited") {
    return (
      <LimitedMatrix
        solCap={solCap}
        mintCaps={mintCaps}
        programPermissions={programPermissions}
      />
    );
  }

  // standard — baseline payments, uncapped, everything else blocked
  return (
    <div className="flex flex-col gap-4">
      <GroupedList label={copy.wallet.policyMatrixAllowed}>
        {POLICY_BASELINE_CAPABILITIES.map((c) => (
          <CapabilityRow
            key={c.id}
            state="allow"
            label={c.label}
            detail={c.program}
          />
        ))}
        <CapabilityRow
          state="allow"
          label={copy.wallet.policyMatrixAmounts}
          detail={copy.wallet.policyMatrixUncapped}
          trailing={
            <InfinityIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          }
        />
      </GroupedList>
      <GroupedList label={copy.wallet.policyMatrixBlocked}>
        <CapabilityRow
          state="block"
          label={copy.wallet.policyMatrixOtherPrograms}
          detail={copy.wallet.policyMatrixOtherProgramsDetail}
        />
      </GroupedList>
    </div>
  );
}

function LimitedMatrix({
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

  const overrideById = useMemo(() => {
    const map = new Map<string, ProgramPermissionView>();
    for (const p of programPermissions) map.set(p.programId, p);
    return map;
  }, [programPermissions]);

  const baselineProgramIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of POLICY_BASELINE_CAPABILITIES) {
      for (const id of c.programIds) ids.add(id);
    }
    return ids;
  }, []);

  const extraPrograms = programPermissions.filter(
    (p) => !baselineProgramIds.has(p.programId),
  );

  return (
    <div className="flex flex-col gap-4">
      {hasAssets ? (
        <GroupedList label={copy.wallet.policyMatrixSpendable}>
          {solCap ? (
            <CapRow
              symbol={copy.wallet.policySolLabel}
              icon={{
                mint: NATIVE_SOL_MINT,
                symbol: copy.wallet.policySolLabel,
                icon: SOL_ICON_URL,
              }}
              capLabel={`${lamportsToSol(solCap.cap)} ${copy.wallet.policySolLabel}`}
              remainingLabel={capRemainingLabel(
                lamportsToSol(solCap.remaining),
                copy.wallet.policySolLabel,
                solCap.lastReset,
                solCap.windowSeconds,
              )}
              windowLabel={windowPhrase(solCap.windowSeconds)}
            />
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
            return (
              <CapRow
                key={m.mint}
                symbol={symbol}
                icon={{
                  mint: m.mint,
                  symbol: token?.symbol ?? "",
                  icon: token?.icon ?? null,
                }}
                capLabel={
                  amount != null
                    ? `${amount} ${symbol}`.trim()
                    : shortAddress(m.mint)
                }
                remainingLabel={
                  remaining != null
                    ? capRemainingLabel(
                        remaining,
                        symbol,
                        m.lastReset,
                        m.windowSeconds,
                      )
                    : nextResetDate(m.lastReset, m.windowSeconds)
                      ? copy.wallet.policyResetsOn(
                          nextResetDate(m.lastReset, m.windowSeconds)!,
                        )
                      : copy.wallet.policyNoReset
                }
                windowLabel={windowPhrase(m.windowSeconds)}
              />
            );
          })}
        </GroupedList>
      ) : null}

      <GroupedList label={copy.wallet.policyMatrixPrograms}>
        {POLICY_BASELINE_CAPABILITIES.map((c) => {
          const overrides = c.programIds
            .map((id) => overrideById.get(id))
            .filter((p): p is ProgramPermissionView => Boolean(p));
          const kind = overrides.some((p) => p.kind === "deny")
            ? "deny"
            : overrides.some((p) => p.kind === "custom")
              ? "custom"
              : "allow";
          return (
            <CapabilityRow
              key={c.id}
              state={kind === "deny" ? "block" : "allow"}
              label={c.label}
              detail={
                kind === "custom"
                  ? copy.wallet.policyAccessCustom
                  : kind === "deny"
                    ? copy.wallet.policyAccessDeny
                    : c.program
              }
              trailing={
                kind !== "allow" ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      kind === "deny"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {kind === "deny"
                      ? copy.wallet.policyAccessDeny
                      : copy.wallet.policyAccessCustom}
                  </span>
                ) : undefined
              }
            />
          );
        })}
        {extraPrograms.map((p) => (
          <CapabilityRow
            key={p.programId}
            state={p.kind === "deny" ? "block" : "allow"}
            label={labelProgramId(p.programId, shortAddress)}
            detail={shortAddress(p.programId, 4)}
            trailing={
              <span
                className={cn(
                  "text-xs font-medium",
                  p.kind === "deny"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {p.kind === "allow"
                  ? copy.wallet.policyAccessAllow
                  : p.kind === "deny"
                    ? copy.wallet.policyAccessDeny
                    : copy.wallet.policyAccessCustom}
              </span>
            }
          />
        ))}
      </GroupedList>

      <GroupedList label={copy.wallet.policyMatrixBlocked}>
        {hasAssets ? (
          <CapabilityRow
            state="block"
            label={copy.wallet.policyMatrixUnlistedAssets}
          />
        ) : null}
        <CapabilityRow
          state="block"
          label={copy.wallet.policyMatrixOtherPrograms}
          detail={copy.wallet.policyMatrixUnlessListed}
        />
      </GroupedList>
    </div>
  );
}

function CapRow({
  symbol,
  icon,
  capLabel,
  remainingLabel,
  windowLabel,
}: {
  symbol: string;
  icon: { mint: string; symbol: string; icon: string | null };
  capLabel: string;
  remainingLabel: string;
  windowLabel: string;
}) {
  return (
    <GroupedRow
      leading={<TokenIcon token={icon} className="size-8" />}
      subtitle={remainingLabel}
      trailing={
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-sm tabular-nums font-medium">{capLabel}</span>
          <span className="text-[11px] text-muted-foreground">
            {windowLabel}
          </span>
        </div>
      }
    >
      {symbol}
    </GroupedRow>
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
  const [turnOffPhrase, setTurnOffPhrase] = useState("");
  const turnOffConfirmed =
    turnOffPhrase.trim() === copy.wallet.policyTurnOffConfirmPhrase;

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
            onClick={() => {
              setTurnOffPhrase("");
              setTurnOffOpen(true);
            }}
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
          if (!clear.isPending) {
            setTurnOffOpen(next);
            if (!next) setTurnOffPhrase("");
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.wallet.policyTurnOffConfirmTitle}</DialogTitle>
            <DialogDescription>
              {copy.wallet.policyTurnOffConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-1">
            <label
              htmlFor="policy-turn-off-phrase"
              className="text-sm text-muted-foreground"
            >
              Type{" "}
              <span className="font-medium text-foreground">
                {copy.wallet.policyTurnOffConfirmPhrase}
              </span>{" "}
              to confirm
            </label>
            <Input
              id="policy-turn-off-phrase"
              value={turnOffPhrase}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTurnOffPhrase(e.target.value)}
              disabled={clear.isPending}
            />
          </div>
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
              disabled={clear.isPending || !turnOffConfirmed}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(copy.wallet.policyTurnedOff);
                    setTurnOffOpen(false);
                    setTurnOffPhrase("");
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
