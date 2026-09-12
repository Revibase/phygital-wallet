"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { normalizeAllowedOrigin } from "@/lib/wallet/policy-settings";

function sameOriginSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((o) => set.has(o));
}

/**
 * Allowed sites — restrict which website origins may request signatures.
 * Empty list ⇒ any connected origin can sign. Enforced at sign time against the
 * origin bound into the session bearer.
 */
export function AllowedSitesSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [origins, setOrigins] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const saved = editor.settings?.allowedOrigins ?? [];

  useEffect(() => {
    if (!editor.settings) return;
    setOrigins([...editor.settings.allowedOrigins]);
  }, [editor.settings]);

  const dirty = !sameOriginSet(origins, saved);

  function addOrigin() {
    const normalized = normalizeAllowedOrigin(draft);
    if (!normalized) {
      toast.error(copy.wallet.invalidOrigin);
      return;
    }
    if (!origins.includes(normalized)) {
      setOrigins([...origins, normalized]);
    }
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.allowedSites}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {copy.wallet.allowedSitesHint}
          </p>

          {origins.length > 0 ? (
            <div className="rounded-2xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              {copy.wallet.allowedSitesLockedNote}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              {copy.wallet.allowedSitesListLabel}
            </p>
            {origins.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {copy.wallet.allowedSitesEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {origins.map((o) => (
                  <li
                    key={o}
                    className="flex items-center gap-2 rounded-xl bg-muted/25 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{o}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={copy.common.remove}
                      onClick={() => setOrigins(origins.filter((x) => x !== o))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {adding ? (
            <div className="flex gap-2">
              <Input
                value={draft}
                inputMode="url"
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOrigin();
                  }
                }}
                placeholder={copy.wallet.allowedSitesAddPlaceholder}
                aria-label={copy.wallet.allowedSitesAddLabel}
                className="text-sm"
              />
              <Button type="button" variant="secondary" onClick={addOrigin}>
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
              {copy.wallet.allowedSitesAddCta}
            </Button>
          )}

          {dirty ? (
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={editor.busy}
              onClick={() =>
                void editor.save({ allowedOrigins: origins }, onBack)
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
      )}
    </div>
  );
}
