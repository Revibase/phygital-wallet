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

import { GroupedRow } from "@/components/shared/grouped-list";
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
import { FieldError, Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ProgramAccessKind,
  ProgramPermissionView,
  SpendCapView,
} from "@/hooks/token/use-wallet-policy";
import { useSetWalletPolicy } from "@/hooks/token/use-set-wallet-policy";
import { useVerifiedTokens } from "@/hooks/wallet/use-verified-tokens";
import { copy } from "@/lib/copy/phygital";
import { tryParseAddress } from "@/lib/solana/address";
import {
  formatTokenAmount,
  sanitizeDecimalInput,
  uiAmountToRaw,
} from "@/lib/tokens/amount";
import {
  NATIVE_SOL_MINT,
  NATIVE_SOL_TOKEN_PROGRAM,
  SOL_ICON_URL,
  type PaymentToken,
} from "@/lib/tokens/payment-token";
import {
  POLICY_WINDOW_PRESETS,
  SOL_DECIMALS,
  isSolLikeMint,
  lamportsToSol,
  windowPhrase,
} from "@/lib/wallet/policy-format";
import { policyPresets, type PolicyPreset } from "@/lib/wallet/policy-presets";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn, shortAddress } from "@/lib/utils";

import {
  DEFAULT_POLICY_WINDOW,
  MAX_MINT_CAPS,
  type ProgramPermissionDraft,
} from "./policy-types";

/** UI draft for one spendable asset — SOL uses the on-chain solCap slot. */
type AssetCapDraft = {
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

const SOL_TOKEN: PaymentToken = {
  mint: NATIVE_SOL_MINT,
  symbol: "SOL",
  name: "Solana",
  icon: SOL_ICON_URL,
  decimals: SOL_DECIMALS,
  tokenProgram: NATIVE_SOL_TOKEN_PROGRAM,
};

/**
 * Limit / edit flow: presets → unified asset list (SOL + tokens) → summary →
 * Extra programs → Save. On-chain SOL still maps to `solCap`; other mints to
 * `mintCaps`.
 */
export function PolicyLimitEditor({
  phygitalTokenPda,
  solCap,
  mintCaps,
  programPermissions,
  onDone,
}: {
  phygitalTokenPda: string;
  solCap: SpendCapView | null;
  mintCaps: (SpendCapView & { mint: string })[];
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
  return (
    <PolicyLimitEditorForm
      phygitalTokenPda={phygitalTokenPda}
      solCap={solCap}
      mintCaps={mintCaps}
      programPermissions={programPermissions}
      tokens={tokens.data ?? []}
      onDone={onDone}
    />
  );
}

function PolicyLimitEditorForm({
  phygitalTokenPda,
  solCap,
  mintCaps,
  programPermissions,
  tokens,
  onDone,
}: {
  phygitalTokenPda: string;
  solCap: SpendCapView | null;
  mintCaps: (SpendCapView & { mint: string })[];
  programPermissions: ProgramPermissionView[];
  tokens: PaymentToken[];
  onDone: () => void;
}) {
  const setPolicy = useSetWalletPolicy(phygitalTokenPda);
  const catalog = useMemo(() => assetCatalog(tokens), [tokens]);
  const byMint = useMemo(() => indexByMint(catalog), [catalog]);

  const [drafts, setDrafts] = useState<AssetCapDraft[]>(() =>
    initialDrafts(solCap, mintCaps, byMint),
  );
  const [programs, setPrograms] = useState<ProgramPermissionDraft[]>(() =>
    programPermissions.map((p) => ({
      programId: p.programId,
      kind: p.kind,
      access: p.access,
    })),
  );
  const [newProgramId, setNewProgramId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(
    programPermissions.length > 0,
  );
  const [allowConfirm, setAllowConfirm] = useState<
    null | { mode: "switch"; programId: string } | { mode: "save" }
  >(null);

  const busy = setPolicy.isPending;
  const usedMints = useMemo(() => new Set(drafts.map((d) => d.mint)), [drafts]);
  const mintDraftCount = drafts.filter((d) => d.mint !== NATIVE_SOL_MINT).length;
  const addable = useMemo(
    () =>
      catalog.filter((t) => {
        if (usedMints.has(t.mint)) return false;
        // Wrapped SOL is covered by the native SOL cap — don't list it twice.
        if (isSolLikeMint(t.mint) && t.mint !== NATIVE_SOL_MINT) return false;
        if (t.mint !== NATIVE_SOL_MINT && mintDraftCount >= MAX_MINT_CAPS) {
          return false;
        }
        return true;
      }),
    [catalog, usedMints, mintDraftCount],
  );
  const showPresets =
    !solCap && mintCaps.length === 0 && drafts.length === 0;

  function updateDraft(mint: string, patch: Partial<AssetCapDraft>) {
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
        windowSeconds: DEFAULT_POLICY_WINDOW,
        rawFallback: 0n,
      },
    ]);
    setPickerOpen(false);
  }

  function applyPreset(preset: PolicyPreset) {
    setDrafts(draftsFromPreset(preset, byMint));
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
      { programId: id, kind: "deny", access: null },
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
    if (kind === "allow") {
      setAllowConfirm({ mode: "switch", programId });
      return;
    }
    setPrograms((prev) =>
      prev.map((p) => (p.programId === programId ? { ...p, kind } : p)),
    );
  }
  function removeProgram(programId: string) {
    setPrograms((prev) => prev.filter((p) => p.programId !== programId));
  }

  function commitSave() {
    const nextErrors: Record<string, string> = {};

    let solCapArg: { cap: bigint; windowSeconds: bigint } | null = null;
    const mintCapArgs: {
      mint: string;
      cap: bigint;
      windowSeconds: bigint;
    }[] = [];

    for (const d of drafts) {
      if (d.mint === NATIVE_SOL_MINT) {
        try {
          solCapArg = {
            cap: uiAmountToRaw(d.amount, SOL_DECIMALS),
            windowSeconds: d.windowSeconds,
          };
        } catch (e) {
          nextErrors[d.mint] = toUserErrorMessage(e);
        }
        continue;
      }
      if (d.decimals == null) {
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

  function save() {
    if (programs.some((p) => p.kind === "allow")) {
      setAllowConfirm({ mode: "save" });
      return;
    }
    commitSave();
  }

  function confirmAllowDanger() {
    if (!allowConfirm) return;
    if (allowConfirm.mode === "switch") {
      const programId = allowConfirm.programId;
      setPrograms((prev) =>
        prev.map((p) =>
          p.programId === programId ? { ...p, kind: "allow" } : p,
        ),
      );
      setAllowConfirm(null);
      return;
    }
    setAllowConfirm(null);
    commitSave();
  }

  const previewLines: string[] = [];
  for (const d of drafts) {
    if (d.decimals == null && d.mint !== NATIVE_SOL_MINT) {
      previewLines.push(
        copy.wallet.policyPreviewSpend(
          d.symbol,
          windowPhrase(d.windowSeconds),
        ),
      );
      continue;
    }
    const n = Number(d.amount);
    if (d.amount.trim() !== "" && Number.isFinite(n) && n > 0) {
      previewLines.push(
        copy.wallet.policyPreviewSpend(
          `${d.amount} ${d.symbol}`,
          windowPhrase(d.windowSeconds),
        ),
      );
    }
  }
  const hasLimits = previewLines.length > 0;
  const summaryLines = previewLines.slice(0, 3);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {showPresets ? <PresetChips onPick={applyPreset} /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1">
          <h2 className="text-section-label px-0">
            {copy.wallet.policyTokenLimits}
          </h2>
          <p className="text-xs text-muted-foreground">
            {copy.wallet.policyTokenLimitsHint}
          </p>
        </div>

        {drafts.map((d) => (
          <AssetCapEditorRow
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
          disabled={addable.length === 0}
          onClick={() => setPickerOpen(true)}
        >
          {copy.wallet.policyAddToken}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/30 bg-muted/40 p-4">
        <h3 className="text-section-label mb-2 px-0">
          {copy.wallet.policyPreviewTitle}
        </h3>
        {hasLimits ? (
          <ul className="flex flex-col gap-1.5">
            {summaryLines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                <span>{line}</span>
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
            {copy.wallet.policyPreviewPrograms(programs.length)}
          </p>
        ) : null}
      </div>

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
            </div>
          </div>
        ) : null}
      </div>

      {errors.form ? (
        <FieldError className="px-1">{errors.form}</FieldError>
      ) : null}

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

      <Dialog
        open={allowConfirm != null}
        onOpenChange={(next) => {
          if (!next) setAllowConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.wallet.policyAccessAllow}</DialogTitle>
            <DialogDescription>
              {copy.wallet.policyAccessAllowDanger}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full sm:w-auto"
              >
                {copy.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              className="w-full rounded-full sm:w-auto"
              onClick={confirmAllowDanger}
            >
              {copy.wallet.policyAccessAllow}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PresetChips({ onPick }: { onPick: (preset: PolicyPreset) => void }) {
  const presets = useMemo(() => policyPresets(), []);
  return (
    <div className="flex flex-col gap-2 px-1">
      <p className="text-section-label px-0">{copy.wallet.policyPresetsTitle}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-h-9 rounded-full px-3.5"
            onClick={() => onPick(preset)}
          >
            {preset.title}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AssetCapEditorRow({
  draft,
  error,
  onChangeAmount,
  onChangeWindow,
  onRemove,
}: {
  draft: AssetCapDraft;
  error?: string;
  onChangeAmount: (amount: string) => void;
  onChangeWindow: (windowSeconds: bigint) => void;
  onRemove: () => void;
}) {
  const editable = draft.decimals != null || draft.mint === NATIVE_SOL_MINT;
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

      {editable ? (
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
          {error ? <FieldError className="px-1">{error}</FieldError> : null}
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
  draft: ProgramPermissionDraft;
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
        <ToggleGroup
          type="single"
          value={draft.kind}
          onValueChange={(next) => {
            if (next === "allow" || next === "deny") onChangeKind(next);
          }}
          variant="outline"
          size="sm"
          spacing={2}
          className="w-full"
          aria-label={`${copy.wallet.policyAccessAllow} / ${copy.wallet.policyAccessDeny}`}
        >
          <ToggleGroupItem
            value="allow"
            className="flex-1 rounded-full data-[state=on]:border-transparent data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
          >
            {copy.wallet.policyAccessAllow}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="deny"
            className="flex-1 rounded-full data-[state=on]:border-transparent data-[state=on]:bg-destructive data-[state=on]:font-semibold data-[state=on]:text-white"
          >
            {copy.wallet.policyAccessDeny}
          </ToggleGroupItem>
        </ToggleGroup>
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
    <ToggleGroup
      type="single"
      value={value.toString()}
      onValueChange={(next) => {
        if (!next) return;
        onChange(BigInt(next));
      }}
      variant="outline"
      size="sm"
      spacing={2}
      className="flex-wrap px-1"
      aria-label={copy.wallet.policyWindowLabel}
    >
      {POLICY_WINDOW_PRESETS.map((preset) => (
        <ToggleGroupItem
          key={preset.label}
          value={preset.seconds.toString()}
          className="rounded-full data-[state=on]:border-transparent data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
        >
          {preset.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-t-3xl md:rounded-3xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{copy.wallet.policyPickToken}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          {tokens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {copy.wallet.policyNoTokensToAdd}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border/30 bg-grouped">
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
      </SheetContent>
    </Sheet>
  );
}

function assetCatalog(tokens: PaymentToken[]): PaymentToken[] {
  const withoutWrappedSol = tokens.filter(
    (t) => !(isSolLikeMint(t.mint) && t.mint !== NATIVE_SOL_MINT),
  );
  if (withoutWrappedSol.some((t) => t.mint === NATIVE_SOL_MINT)) {
    return withoutWrappedSol;
  }
  return [SOL_TOKEN, ...withoutWrappedSol];
}

function indexByMint(tokens: PaymentToken[]): Map<string, PaymentToken> {
  return new Map(tokens.map((t) => [t.mint, t]));
}

function initialDrafts(
  solCap: SpendCapView | null,
  mintCaps: (SpendCapView & { mint: string })[],
  byMint: Map<string, PaymentToken>,
): AssetCapDraft[] {
  const out: AssetCapDraft[] = [];
  if (solCap) {
    out.push({
      mint: NATIVE_SOL_MINT,
      symbol: SOL_TOKEN.symbol,
      icon: SOL_TOKEN.icon,
      decimals: SOL_DECIMALS,
      amount: lamportsToSol(solCap.cap),
      windowSeconds: solCap.windowSeconds,
      rawFallback: solCap.cap,
    });
  }
  for (const m of mintCaps) {
    const token = byMint.get(m.mint);
    const decimals = token?.decimals ?? null;
    out.push({
      mint: m.mint,
      symbol: token?.symbol ?? shortAddress(m.mint),
      icon: token?.icon ?? null,
      decimals,
      amount: decimals != null ? formatTokenAmount(m.cap, decimals) : "",
      windowSeconds: m.windowSeconds,
      rawFallback: m.cap,
    });
  }
  return out;
}

function draftsFromPreset(
  preset: PolicyPreset,
  byMint: Map<string, PaymentToken>,
): AssetCapDraft[] {
  const out: AssetCapDraft[] = [];
  if (preset.solCap) {
    out.push({
      mint: NATIVE_SOL_MINT,
      symbol: SOL_TOKEN.symbol,
      icon: SOL_TOKEN.icon,
      decimals: SOL_DECIMALS,
      amount: lamportsToSol(preset.solCap.cap),
      windowSeconds: preset.solCap.windowSeconds,
      rawFallback: preset.solCap.cap,
    });
  }
  for (const m of preset.mintCaps) {
    const token = byMint.get(m.mint);
    const decimals = token?.decimals ?? 6;
    out.push({
      mint: m.mint,
      symbol: token?.symbol ?? "USDC",
      icon: token?.icon ?? null,
      decimals,
      amount: formatTokenAmount(m.cap, decimals),
      windowSeconds: m.windowSeconds,
      rawFallback: m.cap,
    });
  }
  return out;
}

function programAccessArg(draft: ProgramPermissionDraft): ProgramAccessArgs {
  if (draft.kind === "allow") return programAccess("AllInstructions");
  if (draft.kind === "deny") return programAccess("Denied");
  return draft.access as unknown as ProgramAccessArgs;
}
