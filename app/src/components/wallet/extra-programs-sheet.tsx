"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { cn, shortAddress } from "@/lib/utils";
import { tryParseAddress } from "@/lib/solana/address";
import {
  hasStandingPolicyContent,
  isStandardAllowedProgram,
  STANDARD_COMPANION_PROGRAMS,
  STANDARD_SCOPED_PROGRAMS,
} from "@/lib/wallet/policy-settings";

function sameProgramSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Programs — built-in scoped paths vs unrestricted allowAll additions. */
export function ExtraProgramsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [programs, setPrograms] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmAdd, setConfirmAdd] = useState<string | null>(null);

  const restricted = editor.policyEnabled;
  const savedPrograms = editor.settings?.extraPrograms ?? [];
  const extrasCount = programs.length;
  const orphanBuiltInOnly =
    restricted &&
    editor.settings != null &&
    !hasStandingPolicyContent(editor.settings);

  useEffect(() => {
    if (!editor.settings) return;
    setPrograms([...editor.settings.extraPrograms]);
  }, [editor.settings]);

  function queueAdd() {
    const raw = draft.trim();
    if (!raw) return;
    const parsed = tryParseAddress(raw);
    if (!parsed) {
      toast.error(copy.wallet.invalidProgramId);
      return;
    }
    const id = String(parsed);
    if (isStandardAllowedProgram(id) || programs.includes(id)) {
      setDraft("");
      return;
    }
    setConfirmAdd(id);
  }

  function confirmQueuedAdd() {
    if (!confirmAdd) return;
    setPrograms((p) => [...p, confirmAdd]);
    setDraft("");
    setConfirmAdd(null);
  }

  const statusTitle = !restricted
    ? copy.wallet.extraProgramsAllAllowed
    : extrasCount > 0
      ? copy.wallet.extraProgramsWithUnrestricted(extrasCount)
      : copy.wallet.extraProgramsBuiltIn;

  const statusBody = orphanBuiltInOnly
    ? copy.wallet.extraProgramsOrphanBody
    : !restricted
      ? copy.wallet.extraProgramsAllAllowedBody
      : extrasCount > 0
        ? copy.wallet.extraProgramsWithUnrestrictedBody
        : copy.wallet.extraProgramsBuiltInBody;

  const dirty = !sameProgramSet(programs, savedPrograms);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.extraPrograms}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {copy.wallet.extraProgramsHint}
          </p>

          <div className="rounded-2xl bg-muted/25 px-4 py-3">
            <p className="text-sm font-medium">{statusTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{statusBody}</p>
          </div>

          {orphanBuiltInOnly ? (
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={editor.busy}
              onClick={() => void editor.turnOff(onBack)}
            >
              {editor.turningOff ? (
                <Spinner className="size-4" />
              ) : (
                copy.wallet.extraProgramsAllowAllCta
              )}
            </Button>
          ) : null}

          {extrasCount > 0 ? (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {copy.wallet.unrestrictedAppsWarn}
            </div>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="h-auto min-h-11 w-full justify-between rounded-2xl bg-muted/25 px-4 py-3 text-sm font-medium hover:bg-muted/40"
          >
            {advancedOpen
              ? copy.wallet.extraProgramsAdvancedHide
              : copy.wallet.extraProgramsAdvanced}
            {advancedOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </Button>

          {advancedOpen ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  {copy.wallet.extraProgramsProtected}
                </p>
                <p className="px-1 text-xs text-muted-foreground">
                  {copy.wallet.extraProgramsProtectedHint}
                </p>
                <ul className="flex flex-col gap-1">
                  {STANDARD_SCOPED_PROGRAMS.map((p) => (
                    <li
                      key={p.programId}
                      className="flex items-center gap-2 rounded-xl bg-muted/25 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {p.label}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {shortAddress(p.programId, 6)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  {copy.wallet.extraProgramsCompanions}
                </p>
                <p className="px-1 text-xs text-muted-foreground">
                  {copy.wallet.extraProgramsCompanionsHint}
                </p>
                <ul className="flex flex-col gap-1">
                  {STANDARD_COMPANION_PROGRAMS.map((p) => (
                    <li
                      key={p.programId}
                      className="flex items-center gap-2 rounded-xl bg-muted/25 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {p.label}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {shortAddress(p.programId, 6)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  {copy.wallet.extraProgramsUnrestricted}
                </p>
                <p className="px-1 text-xs text-muted-foreground">
                  {copy.wallet.extraProgramsUnrestrictedHint}
                </p>
                {programs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {copy.wallet.extraProgramsEmpty}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {programs.map((p) => (
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
                            setPrograms((prev) => prev.filter((x) => x !== p))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {confirmAdd ? (
                <div className="space-y-3 rounded-2xl bg-destructive/10 px-4 py-3">
                  <p className="text-sm text-destructive">
                    {copy.wallet.extraProgramsAddConfirm}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {shortAddress(confirmAdd, 8)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setConfirmAdd(null)}
                    >
                      {copy.common.cancel}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={confirmQueuedAdd}
                    >
                      {copy.wallet.extraProgramsAddConfirmCta}
                    </Button>
                  </div>
                </div>
              ) : (
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
              )}

              {dirty ? (
                <Button
                  type="button"
                  size="lg"
                  className="mt-auto w-full rounded-full"
                  disabled={editor.busy}
                  onClick={() =>
                    void editor.save({ extraPrograms: programs }, onBack)
                  }
                >
                  {editor.saving || editor.turningOff ? (
                    <Spinner className="size-4" />
                  ) : (
                    copy.wallet.save
                  )}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
