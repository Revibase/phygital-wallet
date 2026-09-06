"use client";

import { useState } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { hasSpendCaps } from "@/lib/wallet/policy-settings";

/** Master switch for Send protections (built-in program surface). */
export function SendProtectionsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [confirmOff, setConfirmOff] = useState(false);

  const on = editor.policyEnabled;
  const settings = editor.settings;
  const hasExtras = (settings?.extraPrograms.length ?? 0) > 0;
  const hasCaps = settings != null && hasSpendCaps(settings);
  const hasRecipients = settings?.recipientMode === "allowlist";
  const tearDownHeavy = hasCaps || hasRecipients || hasExtras;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.sendProtections}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {copy.wallet.sendProtectionsHint}
          </p>
          <div className="rounded-2xl bg-muted/25 px-4 py-3">
            <p className="text-sm font-medium">
              {on
                ? copy.wallet.sendProtectionsOn
                : copy.wallet.sendProtectionsOff}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {on
                ? copy.wallet.sendProtectionsOnBody
                : copy.wallet.sendProtectionsOffBody}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {!on ? (
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
            ) : confirmOff ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {copy.wallet.sendProtectionsTurnOffConfirm}
                </p>
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
                    copy.wallet.sendProtectionsTurnOff
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={editor.busy}
                  onClick={() => setConfirmOff(false)}
                >
                  {copy.common.cancel}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full rounded-full"
                disabled={editor.busy}
                onClick={() => {
                  if (tearDownHeavy) setConfirmOff(true);
                  else void editor.turnOff(onBack);
                }}
              >
                {copy.wallet.sendProtectionsTurnOff}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
