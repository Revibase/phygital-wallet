"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/lib/copy/phygital";
import { cn, shortAddress } from "@/lib/utils";
import { tryParseAddress } from "@/lib/solana/address";
import {
  isStandardAllowedProgram,
  STANDARD_ALLOWED_PROGRAMS,
} from "@/lib/wallet/policy-settings";

export type ExceptionsPanelProps = {
  protectionsOn: boolean;
  customPrograms: string[];
  busy?: boolean;
  saving?: boolean;
  dirty?: boolean;
  onCustomProgramsChange: (next: string[]) => void;
  onSave: () => void;
  onEnableProtections?: () => void;
};

/** Exceptions under Send protections — unrestricted allowAll additions only. */
export function ExceptionsPanel({
  protectionsOn,
  customPrograms,
  busy = false,
  saving = false,
  dirty = false,
  onCustomProgramsChange,
  onSave,
  onEnableProtections,
}: ExceptionsPanelProps) {
  const [draft, setDraft] = useState("");
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [adding, setAdding] = useState(false);

  function queueAdd() {
    const raw = draft.trim();
    if (!raw) return;
    const parsed = tryParseAddress(raw);
    if (!parsed) {
      toast.error(copy.wallet.invalidProgramId);
      return;
    }
    const id = String(parsed);
    if (isStandardAllowedProgram(id)) {
      toast.error(copy.wallet.extraProgramsAlreadyBuiltIn);
      setDraft("");
      return;
    }
    if (customPrograms.includes(id)) {
      setDraft("");
      return;
    }
    setPendingAdd(id);
  }

  function confirmAdd() {
    if (!pendingAdd) return;
    onCustomProgramsChange([...customPrograms, pendingAdd]);
    setDraft("");
    setPendingAdd(null);
    setAdding(false);
  }

  if (!protectionsOn) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {copy.wallet.extraProgramsHint}
        </p>
        <div className="rounded-2xl bg-muted/25 px-4 py-3">
          <p className="text-sm font-medium">
            {copy.wallet.extraProgramsAllAllowed}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.wallet.sendProtectionsRequired}
          </p>
        </div>
        {onEnableProtections ? (
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={onEnableProtections}
          >
            {saving ? (
              <Spinner className="size-4" />
            ) : (
              copy.wallet.sendProtectionsTurnOn
            )}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {copy.wallet.extraProgramsHint}
      </p>

      <div className="rounded-2xl bg-muted/25 px-4 py-3">
        <p className="text-sm font-medium">
          {customPrograms.length > 0
            ? copy.wallet.extraProgramsWithUnrestricted(customPrograms.length)
            : copy.wallet.extraProgramsBuiltIn}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {customPrograms.length > 0
            ? copy.wallet.extraProgramsWithUnrestrictedBody
            : copy.wallet.extraProgramsBuiltInBody}
        </p>
      </div>

      {customPrograms.length > 0 ? (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {copy.wallet.unrestrictedAppsWarn}
        </div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        onClick={() => setShowBuiltIn((o) => !o)}
        className="h-auto min-h-11 w-full justify-between rounded-2xl bg-muted/25 px-4 py-3 text-sm font-medium hover:bg-muted/40"
      >
        {showBuiltIn
          ? copy.wallet.extraProgramsHideBuiltIn
          : copy.wallet.extraProgramsShowBuiltIn}
      </Button>

      {showBuiltIn ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {STANDARD_ALLOWED_PROGRAMS.map((p) => (
            <li
              key={p.programId}
              className="rounded-xl bg-muted/25 px-3 py-2"
            >
              <p className="truncate text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.blurb}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          {copy.wallet.extraProgramsUnrestricted}
        </p>
        <p className="px-1 text-xs text-muted-foreground">
          {copy.wallet.extraProgramsUnrestrictedHint}
        </p>
        {customPrograms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {copy.wallet.extraProgramsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {customPrograms.map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-xl bg-muted/25 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {shortAddress(p, 6)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={copy.common.remove}
                  onClick={() =>
                    onCustomProgramsChange(
                      customPrograms.filter((x) => x !== p),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingAdd ? (
        <div className="space-y-3 rounded-2xl bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            {copy.wallet.extraProgramsAddConfirm}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {shortAddress(pendingAdd, 8)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setPendingAdd(null)}
            >
              {copy.common.cancel}
            </Button>
            <Button type="button" className="flex-1" onClick={confirmAdd}>
              {copy.wallet.extraProgramsAddConfirmCta}
            </Button>
          </div>
        </div>
      ) : adding ? (
        <div className={cn("flex gap-2")}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
            placeholder={copy.wallet.programId}
            className="font-mono text-sm"
          />
          <Button type="button" variant="secondary" onClick={queueAdd}>
            {copy.wallet.add}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full rounded-full"
          onClick={() => setAdding(true)}
        >
          {copy.wallet.extraProgramsAddCta}
        </Button>
      )}

      {dirty ? (
        <Button
          type="button"
          size="lg"
          className="w-full rounded-full"
          disabled={busy}
          onClick={onSave}
        >
          {saving ? <Spinner className="size-4" /> : copy.wallet.save}
        </Button>
      ) : null}
    </div>
  );
}
