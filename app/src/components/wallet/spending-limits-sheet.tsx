"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { FIRST_ENABLE_POLICY_SETTINGS } from "@/lib/wallet/policy-settings";

function formatCap(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(n);
}

/** Max per-send USDC / SOL on the built-in send surface. */
export function SpendingLimitsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [maxPerSend, setMaxPerSend] = useState("");
  const [maxSol, setMaxSol] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!editor.settings) return;
    if (editor.spendCapsEnabled) {
      setMaxPerSend(editor.settings.maxTransferUsdc ?? "");
      setMaxSol(editor.settings.maxTransferSol ?? "");
    } else {
      setMaxPerSend(FIRST_ENABLE_POLICY_SETTINGS.maxTransferUsdc ?? "50");
      setMaxSol(FIRST_ENABLE_POLICY_SETTINGS.maxTransferSol ?? "0.1");
    }
  }, [editor.settings, editor.spendCapsEnabled]);

  const protectionsOn = editor.policyEnabled;
  const enabled = editor.spendCapsEnabled;
  const invalid = editor.policyInvalid;
  const extras = editor.settings?.extraPrograms.length ?? 0;

  const statusTitle = !protectionsOn
    ? copy.wallet.sendProtectionsOff
    : invalid
      ? copy.wallet.spendingLimitsInvalid
      : enabled
        ? copy.wallet.spendingLimitsOn
        : copy.wallet.spendingLimitsOff;

  const statusBody = !protectionsOn
    ? copy.wallet.sendProtectionsRequired
    : invalid
      ? copy.wallet.spendingLimitsInvalidBody
      : enabled
        ? copy.wallet.spendingLimitsOnBody(
            formatCap(editor.settings?.maxTransferUsdc),
            formatCap(editor.settings?.maxTransferSol),
          )
        : copy.wallet.spendingLimitsOffBody;

  function saveCaps() {
    const usdc = maxPerSend.trim() || null;
    const sol = maxSol.trim() || null;
    if (!usdc && !sol) {
      if (enabled) {
        void editor.clearSpendCaps(onBack);
        return;
      }
      toast.error(copy.wallet.spendingLimitsSaveNeedsCap);
      return;
    }
    void editor.save(
      {
        programAllowlist: true,
        includeStandardPrograms: true,
        maxTransferUsdc: usdc,
        maxTransferSol: sol,
      },
      onBack,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.spendingLimits}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {copy.wallet.spendingLimitsHint}
          </p>

          <div className="rounded-2xl bg-muted/25 px-4 py-3">
            <p className="text-sm font-medium">{statusTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{statusBody}</p>
          </div>

          {!protectionsOn ? (
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={editor.busy}
              onClick={() => void editor.enableProtections(onBack)}
            >
              {editor.saving ? (
                <Spinner className="size-4" />
              ) : (
                copy.wallet.sendProtectionsTurnOn
              )}
            </Button>
          ) : (
            <>
              {extras > 0 ? (
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
                  ? copy.wallet.spendingLimitsAdvancedHide
                  : copy.wallet.spendingLimitsAdvanced}
                {advancedOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </Button>

              {advancedOpen ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    {copy.wallet.spendingLimitsAdvancedHint}
                  </p>

                  <FieldLabel className="normal-case tracking-normal text-xs">
                    {copy.wallet.maxPerSend}
                  </FieldLabel>
                  <Input
                    inputMode="decimal"
                    value={maxPerSend}
                    onChange={(e) =>
                      setMaxPerSend(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="50"
                  />
                  <FieldLabel className="normal-case tracking-normal text-xs">
                    {copy.wallet.maxSolPerSend}
                  </FieldLabel>
                  <Input
                    inputMode="decimal"
                    value={maxSol}
                    onChange={(e) =>
                      setMaxSol(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="0.1"
                  />

                  {!enabled && !invalid ? (
                    <p className="text-xs text-muted-foreground">
                      {copy.wallet.spendingLimitsSaveTurnsOn}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-full rounded-full"
                      disabled={editor.busy}
                      onClick={saveCaps}
                    >
                      {editor.saving || editor.turningOff ? (
                        <Spinner className="size-4" />
                      ) : (
                        copy.wallet.save
                      )}
                    </Button>
                    {enabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="w-full rounded-full"
                        disabled={editor.busy}
                        onClick={() => void editor.clearSpendCaps(onBack)}
                      >
                        {editor.turningOff || editor.saving ? (
                          <Spinner className="size-4" />
                        ) : (
                          copy.wallet.limitsTurnOff
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
