"use client";

import { useMemo, useState } from "react";
import { Ban, Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import {
  programAccess,
  type ProgramAccessArgs,
  type ProgramPermissionArgs,
} from "phygital-wallet-sdk";
import { address as toAddress } from "@solana/kit";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedRow } from "@/components/shared/grouped-list";
import { ModalSheet } from "@/components/shared/modal-sheet";
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
import { FieldError, FieldLabel, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ClaimedSuccessDialog } from "@/components/wallet/claimed-success-dialog";
import { useClearWalletPolicy } from "@/hooks/token/use-clear-wallet-policy";
import { useClaimAccessory } from "@/hooks/token/use-claim-accessory";
import { useSetWalletPolicy } from "@/hooks/token/use-set-wallet-policy";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useWalletPolicy } from "@/hooks/token/use-wallet-policy";
import { useVerifiedTokens } from "@/hooks/wallet/use-verified-tokens";
import type {
  ProgramAccessKind,
  ProgramPermissionView,
} from "@/hooks/token/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { tryParseAddress } from "@/lib/solana/address";
import {
  formatTokenAmount,
  sanitizeDecimalInput,
  uiAmountToRaw,
} from "@/lib/tokens/amount";
import { NATIVE_SOL_MINT, type PaymentToken } from "@/lib/tokens/payment-token";
import {
  POLICY_WINDOW_PRESETS,
  SOL_DECIMALS,
  isSolLikeMint,
  lamportsToSol,
  nextResetDate,
  windowPhrase,
} from "@/lib/wallet/policy-format";
import { POLICY_BASELINE_ACTIONS } from "@/lib/wallet/policy-baseline";
import {
  policyPresets,
  type PolicyPreset,
} from "@/lib/wallet/policy-presets";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

type Mode = "view" | "edit";

/** On-chain cap max is 8 per-mint caps. */
const MAX_MINT_CAPS = 8;
const DEFAULT_WINDOW = 604_800n; // weekly

/**
 * Spend-policy panel. Publicly viewable (the wallet route floor is the
 * browse-unlock cookie); editing controls render only when the signed-in owner
 * wallet is this accessory's on-chain authority (`useTokenOwner().isOwner`).
 * Unclaimed accessories (`status === "none"`) show locked — no transactions.
 */
export function WalletPolicySheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const policy = useWalletPolicy(phygitalTokenPda);
  const { isOwner, isSignedIn, isClaimed } = useTokenOwner(phygitalTokenPda);
  const claim = useClaimAccessory(phygitalTokenPda);
  const [mode, setMode] = useState<Mode>("view");
  const [claimedOpen, setClaimedOpen] = useState(false);

  const data = policy.data;
  const status = data?.status ?? "none";
  const hasLimits = Boolean(data?.hasLimits);

  const header = (
    <NavBar
      leading={
        <NavBarBack
          onClick={mode === "edit" ? () => setMode("view") : onBack}
          desktopHidden
        />
      }
      title={copy.wallet.policy}
    />
  );

  if (mode === "edit" && isOwner) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {header}
        <PolicyEditor
          phygitalTokenPda={phygitalTokenPda}
          solCap={data?.solCap ?? null}
          mintCaps={data?.mintCaps ?? []}
          programPermissions={data?.programPermissions ?? []}
          onDone={() => setMode("view")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {header}

      <p className="px-1 text-sm text-muted-foreground">
        {copy.wallet.policyHint}
      </p>

      {policy.isLoading ? (
        <div className="flex flex-col gap-3 px-1">
          <Skeleton className="h-9 w-40 rounded" />
          <Skeleton className="h-4 w-56 rounded" />
        </div>
      ) : status === "none" ? (
        <div className="flex flex-col gap-3">
          <StatusCard
            title={copy.wallet.policyStatusLocked}
            body={copy.wallet.policyStatusLockedBody}
            tone="warn"
          />
          {isSignedIn && !isClaimed ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={claim.isPending}
              onClick={() =>
                claim.mutate(undefined, {
                  onSuccess: () => setClaimedOpen(true),
                  onError: (err) =>
                    toast.error(
                      toUserErrorMessage(err, copy.wallet.authorityClaimFailed),
                    ),
                })
              }
            >
              {claim.isPending
                ? copy.wallet.authorityClaiming
                : copy.wallet.policyLockedClaimCta}
            </Button>
          ) : null}
        </div>
      ) : status === "limited" ? (
        <div className="flex flex-col gap-4">
          <StatusCard
            title={copy.wallet.policyStatusLimited}
            body={copy.wallet.policyAllowlistNote}
          />
          <PolicyView
            solCap={data?.solCap ?? null}
            mintCaps={data?.mintCaps ?? []}
            programPermissions={data?.programPermissions ?? []}
          />
        </div>
      ) : status === "open" ? (
        <StatusCard
          title={copy.wallet.policyStatusOpen}
          body={copy.wallet.policyStatusOpenBody}
          tone="warn"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <StatusCard
            title={copy.wallet.policyStatusStandard}
            body={copy.wallet.policyStatusStandardBody}
          />
          <BaselineList />
          {isOwner ? (
            <PolicyPresetList phygitalTokenPda={phygitalTokenPda} />
          ) : null}
        </div>
      )}

      {isOwner && status !== "none" ? (
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => setMode("edit")}
          >
            {hasLimits ? copy.wallet.policyEdit : copy.wallet.policySet}
          </Button>
          {hasLimits ? (
            <RestoreStandardButton phygitalTokenPda={phygitalTokenPda} />
          ) : null}
          {status === "standard" || status === "limited" ? (
            <TurnOffProtectionsButton phygitalTokenPda={phygitalTokenPda} />
          ) : null}
          {status === "open" ? (
            <RestoreStandardButton phygitalTokenPda={phygitalTokenPda} />
          ) : null}
        </div>
      ) : status !== "none" && !isSignedIn ? (
        <p className="px-1 text-sm text-muted-foreground">
          {copy.wallet.policySignInToEdit}
        </p>
      ) : null}

      <ClaimedSuccessDialog
        open={claimedOpen}
        onOpenChange={setClaimedOpen}
        phygitalTokenPda={phygitalTokenPda}
      />
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────

type PolicySolCap = {
  cap: bigint;
  remaining: bigint;
  lastReset: bigint;
  windowSeconds: bigint;
};
type PolicyMintCap = {
  mint: string;
  cap: bigint;
  remaining: bigint;
  lastReset: bigint;
  windowSeconds: bigint;
};

const ACCESS_LABEL: Record<ProgramAccessKind, string> = {
  allow: copy.wallet.policyAccessAllow,
  deny: copy.wallet.policyAccessDeny,
  custom: copy.wallet.policyAccessCustom,
};

function PolicyView({
  solCap,
  mintCaps,
  programPermissions,
}: {
  solCap: PolicySolCap | null;
  mintCaps: PolicyMintCap[];
  programPermissions: ProgramPermissionView[];
}) {
  const tokens = useVerifiedTokens();
  const byMint = useMemo(() => indexByMint(tokens.data ?? []), [tokens.data]);
  return (
    <div className="flex flex-col gap-5 px-1">
      {solCap ? (
        <div className="flex flex-col gap-0.5">
          <p className="font-(family-name:--font-display) text-3xl tabular-nums">
            {lamportsToSol(solCap.cap)} SOL
          </p>
          <p className="text-sm text-muted-foreground">
            {capRemainingLabel(
              solCap.remaining,
              solCap.lastReset,
              solCap.windowSeconds,
            )}
          </p>
        </div>
      ) : null}

      {(solCap || mintCaps.length > 0) ? <AllowlistNote /> : null}

      {mintCaps.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-section-label px-0">
            {copy.wallet.policyTokenLimits}
          </h2>
          <ul className="flex flex-col gap-2">
            {mintCaps.map((m) => {
              const token = byMint.get(m.mint);
              const decimals = token?.decimals ?? null;
              const amount =
                decimals != null ? formatTokenAmount(m.cap, decimals) : null;
              const reset = nextResetDate(m.lastReset, m.windowSeconds);
              return (
                <li key={m.mint} className="flex items-center gap-3">
                  <TokenIcon
                    token={{
                      mint: m.mint,
                      symbol: token?.symbol ?? "",
                      icon: token?.icon ?? null,
                    }}
                    className="size-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {token?.symbol ?? shortAddress(m.mint)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reset
                        ? copy.wallet.policyResetsOn(reset)
                        : copy.wallet.policyNoReset}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">
                      {amount != null
                        ? `${amount} ${token?.symbol ?? ""}`.trim()
                        : shortAddress(m.mint)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {programPermissions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-section-label px-0">
            {copy.wallet.policyPrograms}
          </h2>
          <ul className="flex flex-col gap-2">
            {programPermissions.map((p) => (
              <li key={p.programId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">
                    {shortAddress(p.programId, 6)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm",
                    p.kind === "deny" && "text-destructive",
                  )}
                >
                  {ACCESS_LABEL[p.kind]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BaselineList />
    </div>
  );
}

function StatusCard({
  title,
  body,
  tone = "default",
}: {
  title: string;
  body: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl px-3 py-3",
        tone === "warn" ? "bg-destructive/10" : "bg-muted/50",
      )}
    >
      <p
        className={cn(
          "text-base font-medium",
          tone === "warn" && "text-destructive",
        )}
      >
        {title}
      </p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function BaselineList() {
  return (
    <div className="flex flex-col gap-2 px-1">
      <h2 className="text-section-label px-0">
        {copy.wallet.policyBaselineTitle}
      </h2>
      <p className="text-xs text-muted-foreground">
        {copy.wallet.policyBaselineHint}
      </p>
      <ul className="flex flex-col gap-2">
        {POLICY_BASELINE_ACTIONS.map((action) => (
          <li key={action.label} className="flex items-start gap-3">
            <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One-tap allow-list setups for owners on everyday payments. */
function PolicyPresetList({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const setPolicy = useSetWalletPolicy(phygitalTokenPda);
  const presets = useMemo(() => policyPresets(), []);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function apply(preset: PolicyPreset) {
    setPendingId(preset.id);
    setPolicy.mutate(
      {
        solCap: preset.solCap,
        mintCaps: preset.mintCaps,
        programPermissions: [],
      },
      {
        onSuccess: () => toast.success(copy.wallet.policyPresetApplied),
        onError: (err) => toast.error(toUserErrorMessage(err)),
        onSettled: () => setPendingId(null),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 px-1">
      <h2 className="text-section-label px-0">
        {copy.wallet.policyPresetsTitle}
      </h2>
      <p className="text-xs text-muted-foreground">
        {copy.wallet.policyPresetsHint}
      </p>
      <ul className="flex flex-col gap-2">
        {presets.map((preset) => {
          const busy = setPolicy.isPending && pendingId === preset.id;
          return (
            <li key={preset.id}>
              <button
                type="button"
                disabled={setPolicy.isPending}
                onClick={() => apply(preset)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-xl border border-border/40 bg-grouped px-3 py-3 text-left transition-colors",
                  "hover:bg-muted/60 disabled:opacity-60",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {preset.title}
                  {busy ? <Spinner className="size-4" /> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {preset.detail}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The allow-list surprise, stated once, wherever asset limits exist. */
function AllowlistNote() {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {copy.wallet.policyAllowlistNote}
      </p>
    </div>
  );
}

/** "0.3 SOL left · resets Sep 22" or the one-time variant. */
function capRemainingLabel(
  remaining: bigint,
  lastReset: bigint,
  windowSeconds: bigint,
): string {
  const amount = lamportsToSol(remaining);
  const reset = nextResetDate(lastReset, windowSeconds);
  return reset
    ? copy.wallet.policyLeftUntil(amount, reset)
    : copy.wallet.policyLeftLifetime(amount);
}

// ── Editor ──────────────────────────────────────────────────────────────────

type MintCapDraft = {
  mint: string;
  symbol: string;
  icon: string | null;
  /** null = mint not in the verified list; edit its raw cap only (preserved). */
  decimals: number | null;
  amount: string;
  windowSeconds: bigint;
  /** Exact raw cap to preserve when `decimals` is unknown. */
  rawFallback: bigint;
};

function PolicyEditor(props: {
  phygitalTokenPda: string;
  solCap: PolicySolCap | null;
  mintCaps: PolicyMintCap[];
  programPermissions: ProgramPermissionView[];
  onDone: () => void;
}) {
  const tokens = useVerifiedTokens();
  if (tokens.isLoading) {
    return (
      <div className="flex flex-col gap-3 px-1">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    );
  }
  return <PolicyEditorForm {...props} tokens={tokens.data ?? []} />;
}

type ProgramDraft = {
  programId: string;
  /** `custom` rows are read-only; their `access` is preserved verbatim. */
  kind: ProgramAccessKind;
  access: ProgramPermissionView["access"] | null;
};

function PolicyEditorForm({
  phygitalTokenPda,
  solCap,
  mintCaps,
  programPermissions,
  tokens,
  onDone,
}: {
  phygitalTokenPda: string;
  solCap: PolicySolCap | null;
  mintCaps: PolicyMintCap[];
  programPermissions: ProgramPermissionView[];
  tokens: PaymentToken[];
  onDone: () => void;
}) {
  const setPolicy = useSetWalletPolicy(phygitalTokenPda);
  const byMint = useMemo(() => indexByMint(tokens), [tokens]);

  const [solAmount, setSolAmount] = useState(
    solCap ? lamportsToSol(solCap.cap) : "",
  );
  const [solWindow, setSolWindow] = useState<bigint>(
    solCap?.windowSeconds ?? DEFAULT_WINDOW,
  );
  const [drafts, setDrafts] = useState<MintCapDraft[]>(() =>
    mintCaps.map((m) => {
      const token = byMint.get(m.mint);
      const decimals = token?.decimals ?? null;
      return {
        mint: m.mint,
        symbol: token?.symbol ?? shortAddress(m.mint),
        icon: token?.icon ?? null,
        decimals,
        amount: decimals != null ? formatTokenAmount(m.cap, decimals) : "",
        windowSeconds: m.windowSeconds,
        rawFallback: m.cap,
      };
    }),
  );
  const [programs, setPrograms] = useState<ProgramDraft[]>(() =>
    programPermissions.map((p) => ({
      programId: p.programId,
      kind: p.kind,
      access: p.access,
    })),
  );
  const [newProgramId, setNewProgramId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // Advanced (app permissions) stays collapsed unless the owner already has some.
  const [advancedOpen, setAdvancedOpen] = useState(
    programPermissions.length > 0,
  );

  const busy = setPolicy.isPending;
  const usedMints = useMemo(() => new Set(drafts.map((d) => d.mint)), [drafts]);
  const addable = useMemo(
    () =>
      tokens.filter((t) => !isSolLikeMint(t.mint) && !usedMints.has(t.mint)),
    [tokens, usedMints],
  );
  const showPresets =
    !solCap &&
    mintCaps.length === 0 &&
    drafts.length === 0 &&
    solAmount.trim() === "";

  function updateDraft(mint: string, patch: Partial<MintCapDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.mint === mint ? { ...d, ...patch } : d)),
    );
  }
  function removeDraft(mint: string) {
    setDrafts((prev) => prev.filter((d) => d.mint !== mint));
    setErrors((prev) => {
      if (!(mint in prev)) return prev;
      const next = { ...prev };
      delete next[mint];
      return next;
    });
  }
  function addToken(token: PaymentToken) {
    setDrafts((prev) => [
      ...prev,
      {
        mint: token.mint,
        symbol: token.symbol,
        icon: token.icon,
        decimals: token.decimals,
        amount: "",
        windowSeconds: DEFAULT_WINDOW,
        rawFallback: 0n,
      },
    ]);
    setPickerOpen(false);
  }

  function addProgram() {
    const parsed = tryParseAddress(newProgramId.trim());
    if (!parsed) {
      setErrors((e) => ({
        ...e,
        newProgram: copy.wallet.policyProgramInvalid,
      }));
      return;
    }
    const id = String(parsed);
    if (programs.some((p) => p.programId === id)) {
      setErrors((e) => ({
        ...e,
        newProgram: copy.wallet.policyProgramDuplicate,
      }));
      return;
    }
    setPrograms((prev) => [
      ...prev,
      { programId: id, kind: "allow", access: null },
    ]);
    setNewProgramId("");
    setErrors((prev) => {
      if (!("newProgram" in prev)) return prev;
      const next = { ...prev };
      delete next.newProgram;
      return next;
    });
  }
  function setProgramKind(programId: string, kind: ProgramAccessKind) {
    setPrograms((prev) =>
      prev.map((p) => (p.programId === programId ? { ...p, kind } : p)),
    );
  }
  function removeProgram(programId: string) {
    setPrograms((prev) => prev.filter((p) => p.programId !== programId));
  }

  function save() {
    const nextErrors: Record<string, string> = {};

    let solCapArg: { cap: bigint; windowSeconds: bigint } | null = null;
    if (solAmount.trim() !== "") {
      try {
        solCapArg = {
          cap: uiAmountToRaw(solAmount, SOL_DECIMALS),
          windowSeconds: solWindow,
        };
      } catch (e) {
        nextErrors.sol = toUserErrorMessage(e);
      }
    }

    const mintCapArgs: {
      mint: string;
      cap: bigint;
      windowSeconds: bigint;
    }[] = [];
    for (const d of drafts) {
      if (d.decimals == null) {
        // Unmatched existing cap — preserve its exact raw amount.
        mintCapArgs.push({
          mint: d.mint,
          cap: d.rawFallback,
          windowSeconds: d.windowSeconds,
        });
        continue;
      }
      try {
        mintCapArgs.push({
          mint: d.mint,
          cap: uiAmountToRaw(d.amount, d.decimals),
          windowSeconds: d.windowSeconds,
        });
      } catch (e) {
        nextErrors[d.mint] = toUserErrorMessage(e);
      }
    }

    const programArgs: ProgramPermissionArgs[] = programs.map((p) => ({
      programId: toAddress(p.programId),
      access: programAccessArg(p),
    }));

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const restoringStandard =
      !solCapArg && mintCapArgs.length === 0 && programArgs.length === 0;

    setPolicy.mutate(
      {
        solCap: solCapArg,
        mintCaps: mintCapArgs,
        programPermissions: programArgs,
      },
      {
        onSuccess: () => {
          toast.success(
            restoringStandard
              ? copy.wallet.policyRestored
              : copy.wallet.policySaved,
          );
          onDone();
        },
        onError: (err) => toast.error(toUserErrorMessage(err)),
      },
    );
  }

  // Live preview of what a tap will be allowed to do after saving.
  const previewLines: { main: string; sub: string | null }[] = [];
  const solN = Number(solAmount);
  if (solAmount.trim() !== "" && Number.isFinite(solN) && solN > 0) {
    previewLines.push({
      main: copy.wallet.policyPreviewSpend(
        `${solAmount} SOL`,
        windowPhrase(solWindow),
      ),
      sub: null,
    });
  }
  for (const d of drafts) {
    if (d.decimals == null) {
      previewLines.push({
        main: copy.wallet.policyPreviewSpend(
          d.symbol,
          windowPhrase(d.windowSeconds),
        ),
        sub: null,
      });
      continue;
    }
    const n = Number(d.amount);
    if (d.amount.trim() !== "" && Number.isFinite(n) && n > 0) {
      previewLines.push({
        main: copy.wallet.policyPreviewSpend(
          `${d.amount} ${d.symbol}`,
          windowPhrase(d.windowSeconds),
        ),
        sub: null,
      });
    }
  }
  const hasLimits = previewLines.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {showPresets ? (
        <EditorPresetPicker
          onPick={(preset) => {
            setSolAmount(
              preset.solCap ? lamportsToSol(preset.solCap.cap) : "",
            );
            setSolWindow(preset.solCap?.windowSeconds ?? DEFAULT_WINDOW);
            setDrafts(
              preset.mintCaps.map((m) => {
                const token = byMint.get(m.mint);
                const decimals = token?.decimals ?? 6;
                return {
                  mint: m.mint,
                  symbol: token?.symbol ?? "USDC",
                  icon: token?.icon ?? null,
                  decimals,
                  amount: formatTokenAmount(m.cap, decimals),
                  windowSeconds: m.windowSeconds,
                  rawFallback: m.cap,
                };
              }),
            );
          }}
        />
      ) : (
        <AllowlistNote />
      )}

      {/* SOL cap */}
      <div className="flex flex-col gap-2">
        <FieldLabel className="px-1 normal-case tracking-normal text-xs">
          {copy.wallet.policyAmountLabel}
        </FieldLabel>
        <Input
          inputMode="decimal"
          value={solAmount}
          onChange={(e) => setSolAmount(sanitizeDecimalInput(e.target.value))}
          placeholder="0.5"
          aria-invalid={errors.sol ? true : undefined}
        />
        {errors.sol ? (
          <FieldError className="px-1">{errors.sol}</FieldError>
        ) : null}
        <WindowPills value={solWindow} onChange={setSolWindow} />
        <p className="px-1 text-xs text-muted-foreground">
          {copy.wallet.policyWindowHint}
        </p>
      </div>

      {/* Per-mint caps */}
      <div className="flex flex-col gap-3">
        <div className="px-1">
          <h2 className="text-section-label px-0">
            {copy.wallet.policyTokenLimits}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.wallet.policyTokenLimitsHint}
          </p>
        </div>

        {drafts.map((d) => (
          <MintCapEditorRow
            key={d.mint}
            draft={d}
            error={errors[d.mint]}
            onChangeAmount={(amount) => updateDraft(d.mint, { amount })}
            onChangeWindow={(windowSeconds) =>
              updateDraft(d.mint, { windowSeconds })
            }
            onRemove={() => removeDraft(d.mint)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full rounded-xl"
          disabled={drafts.length >= MAX_MINT_CAPS || addable.length === 0}
          onClick={() => setPickerOpen(true)}
        >
          {copy.wallet.policyAddToken}
        </Button>
      </div>

      {/* Advanced — app permissions (collapsed by default) */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex items-center gap-2 px-1 text-left"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              advancedOpen && "rotate-90",
            )}
            aria-hidden
          />
          <span className="text-section-label px-0">
            {copy.wallet.policyAdvanced}
          </span>
        </button>

        {advancedOpen ? (
          <div className="flex flex-col gap-3">
            <p className="px-1 text-xs text-muted-foreground">
              {copy.wallet.policyProgramsHint}
            </p>

            {programs.map((p) => (
              <ProgramPermissionRow
                key={p.programId}
                draft={p}
                onChangeKind={(kind) => setProgramKind(p.programId, kind)}
                onRemove={() => removeProgram(p.programId)}
              />
            ))}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={newProgramId}
                  onChange={(e) => setNewProgramId(e.target.value.trim())}
                  placeholder={copy.wallet.policyProgramIdPlaceholder}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                  aria-invalid={errors.newProgram ? true : undefined}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="shrink-0 rounded-xl"
                  disabled={newProgramId.trim() === ""}
                  onClick={addProgram}
                >
                  {copy.wallet.policyAddProgram}
                </Button>
              </div>
              {errors.newProgram ? (
                <FieldError className="px-1">{errors.newProgram}</FieldError>
              ) : null}
              <p className="px-1 text-xs text-muted-foreground">
                {copy.wallet.policyProgramsBaseline}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {errors.form ? (
        <FieldError className="px-1">{errors.form}</FieldError>
      ) : null}

      {/* What a tap will be allowed to do after saving */}
      <div className="rounded-2xl border border-border/30 bg-muted/40 p-4">
        <h3 className="text-section-label mb-2 px-0">
          {copy.wallet.policyPreviewTitle}
        </h3>
        {hasLimits ? (
          <ul className="flex flex-col gap-1.5">
            {previewLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                <span>
                  {line.main}
                  {line.sub ? (
                    <span className="text-muted-foreground tabular-nums">
                      {" "}
                      · {line.sub}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
            <li className="flex items-start gap-2 text-sm text-muted-foreground">
              <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{copy.wallet.policyPreviewBlocked}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {copy.wallet.policyPreviewStandard}
          </p>
        )}
        {programs.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {copy.wallet.policyPreviewApps(programs.length)}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={save}
        >
          {busy ? <Spinner className="size-4" /> : copy.wallet.policySave}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={onDone}
        >
          {copy.common.cancel}
        </Button>
      </div>

      <TokenPickerSheet
        open={pickerOpen}
        tokens={addable}
        onClose={() => setPickerOpen(false)}
        onPick={addToken}
      />
    </div>
  );
}

function MintCapEditorRow({
  draft,
  error,
  usd,
  onChangeAmount,
  onChangeWindow,
  onRemove,
}: {
  draft: MintCapDraft;
  error?: string;
  usd?: string | null;
  onChangeAmount: (amount: string) => void;
  onChangeWindow: (windowSeconds: bigint) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/30 bg-grouped p-3">
      <div className="flex items-center gap-3">
        <TokenIcon
          token={{ mint: draft.mint, symbol: draft.symbol, icon: draft.icon }}
          className="size-7"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {draft.symbol}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copy.wallet.policyRemoveTokenAria(draft.symbol)}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      </div>

      {draft.decimals != null ? (
        <>
          <Input
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) =>
              onChangeAmount(sanitizeDecimalInput(e.target.value))
            }
            placeholder="0"
            aria-label={copy.wallet.policyTokenAmountLabel(draft.symbol)}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <FieldError className="px-1">{error}</FieldError>
          ) : usd ? (
            <p className="px-1 text-xs text-muted-foreground tabular-nums">
              {usd}
            </p>
          ) : null}
          <WindowPills value={draft.windowSeconds} onChange={onChangeWindow} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {shortAddress(draft.mint)}
        </p>
      )}
    </div>
  );
}

function ProgramPermissionRow({
  draft,
  onChangeKind,
  onRemove,
}: {
  draft: ProgramDraft;
  onChangeKind: (kind: ProgramAccessKind) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/30 bg-grouped p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {shortAddress(draft.programId, 6)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copy.wallet.policyRemoveProgramAria(draft.programId)}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      </div>

      {draft.kind === "custom" ? (
        <p className="text-xs text-muted-foreground">
          {copy.wallet.policyAccessCustom}
        </p>
      ) : (
        <div className="flex gap-2">
          {(["allow", "deny"] as const).map((kind) => {
            const active = draft.kind === kind;
            return (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className={cn(
                  "rounded-full",
                  active && "font-semibold",
                  active && kind === "deny" && "bg-destructive text-white",
                )}
                onClick={() => onChangeKind(kind)}
              >
                {kind === "allow"
                  ? copy.wallet.policyAccessAllow
                  : copy.wallet.policyAccessDeny}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WindowPills({
  value,
  onChange,
}: {
  value: bigint;
  onChange: (windowSeconds: bigint) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-1">
      {POLICY_WINDOW_PRESETS.map((preset) => {
        const active = preset.seconds === value;
        return (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn("rounded-full", active && "font-semibold")}
            onClick={() => onChange(preset.seconds)}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}

function TokenPickerSheet({
  open,
  tokens,
  onClose,
  onPick,
}: {
  open: boolean;
  tokens: PaymentToken[];
  onClose: () => void;
  onPick: (token: PaymentToken) => void;
}) {
  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={copy.wallet.policyPickToken}
    >
      <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-xl">
        <h2 className="px-1 text-lg font-semibold">
          {copy.wallet.policyPickToken}
        </h2>
        {tokens.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {copy.wallet.policyNoTokensToAdd}
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto overflow-hidden rounded-2xl border border-border/30 bg-grouped">
            {tokens.map((t) => (
              <GroupedRow
                key={t.mint}
                onClick={() => onPick(t)}
                leading={
                  <TokenIcon
                    token={{ mint: t.mint, symbol: t.symbol, icon: t.icon }}
                    className="size-8"
                  />
                }
                subtitle={t.name}
              >
                {t.symbol}
              </GroupedRow>
            ))}
          </ul>
        )}
      </div>
    </ModalSheet>
  );
}

/** Prefill the editor from a quick setup (owner still saves). */
function EditorPresetPicker({
  onPick,
}: {
  onPick: (preset: PolicyPreset) => void;
}) {
  const presets = useMemo(() => policyPresets(), []);
  return (
    <div className="flex flex-col gap-2 px-1">
      <h2 className="text-section-label px-0">
        {copy.wallet.policyPresetsTitle}
      </h2>
      <p className="text-xs text-muted-foreground">
        {copy.wallet.policyPresetsHint}
      </p>
      <ul className="flex flex-col gap-2">
        {presets.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              onClick={() => onPick(preset)}
              className="flex w-full flex-col gap-0.5 rounded-xl border border-border/40 bg-grouped px-3 py-3 text-left transition-colors hover:bg-muted/60"
            >
              <span className="text-sm font-medium">{preset.title}</span>
              <span className="text-xs text-muted-foreground">
                {preset.detail}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RestoreStandardButton({
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
        variant="ghost"
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
        <DialogContent>
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
                disabled={setPolicy.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
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

function TurnOffProtectionsButton({
  phygitalTokenPda,
}: {
  phygitalTokenPda: string;
}) {
  const clear = useClearWalletPolicy(phygitalTokenPda);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="ghost"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        {copy.wallet.policyTurnOff}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!clear.isPending) setOpen(next);
        }}
      >
        <DialogContent>
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
                disabled={clear.isPending}
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(copy.wallet.policyTurnedOff);
                    setOpen(false);
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

function indexByMint(tokens: PaymentToken[]): Map<string, PaymentToken> {
  return new Map(tokens.map((t) => [t.mint, t]));
}

/** Map a program draft to the on-chain access arg; `custom` is preserved verbatim. */
function programAccessArg(draft: ProgramDraft): ProgramAccessArgs {
  if (draft.kind === "allow") return programAccess("AllInstructions");
  if (draft.kind === "deny") return programAccess("Denied");
  // Restricted rules are not editable here — round-trip the decoded access.
  return draft.access as unknown as ProgramAccessArgs;
}
