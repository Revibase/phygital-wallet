"use client";

import { useEffect, useState } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { ExceptionsPanel } from "@/components/wallet/exceptions-panel";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";

function sameProgramSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Exceptions — unrestricted programs added on top of built-in protections. */
export function ExtraProgramsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [customPrograms, setCustomPrograms] = useState<string[]>([]);

  const saved = editor.settings?.extraPrograms ?? [];

  useEffect(() => {
    if (!editor.settings) return;
    setCustomPrograms([...editor.settings.extraPrograms]);
  }, [editor.settings]);

  const dirty = !sameProgramSet(customPrograms, saved);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.extraPrograms}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <ExceptionsPanel
          protectionsOn={editor.policyEnabled}
          customPrograms={customPrograms}
          busy={editor.busy}
          saving={editor.saving || editor.turningOff}
          dirty={dirty}
          onCustomProgramsChange={setCustomPrograms}
          onEnableProtections={() => void editor.enableProtections(onBack)}
          onSave={() =>
            void editor.save(
              {
                programAllowlist: true,
                extraPrograms: customPrograms,
              },
              onBack
            )
          }
        />
      )}
    </div>
  );
}
