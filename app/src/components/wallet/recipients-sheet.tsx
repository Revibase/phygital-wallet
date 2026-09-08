"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Nfc, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { identifyAccessory } from "@/lib/wallet/identify-accessory";
import { shortAddress } from "@/lib/utils";
import { tryParseAddress } from "@/lib/solana/address";
import { toUserErrorMessage } from "@/lib/user-errors";

/** Recipient allowlist — independent of spend caps. */
export function RecipientsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const [mode, setMode] = useState<"anyone" | "allowlist">("anyone");
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const effectiveMode = editor.settings?.recipientMode ?? "anyone";
  const protectionsOn = editor.policyEnabled;
  const restricted = protectionsOn && effectiveMode === "allowlist";
  const extras = editor.settings?.extraPrograms.length ?? 0;

  useEffect(() => {
    if (!editor.settings) return;
    setMode(editor.settings.recipientMode);
    setAllowlist(editor.settings.recipientAllowlist);
  }, [editor.settings]);

  function addAddress(raw: string) {
    const parsed = tryParseAddress(raw.trim());
    if (!parsed) {
      toast.error(copy.wallet.invalidAddress);
      return;
    }
    const next = String(parsed);
    if (allowlist.includes(next)) return;
    setAllowlist((prev) => [...prev, next]);
    setDraft("");
    setMode("allowlist");
  }

  async function pickNfc() {
    try {
      const id = await identifyAccessory();
      addAddress(String(id.walletPda));
    } catch (e) {
      toast.error(toUserErrorMessage(e));
    }
  }

  async function save() {
    if (mode === "allowlist" && allowlist.length === 0) {
      toast.error(copy.wallet.recipientsNeedAddress);
      return;
    }
    await editor.save(
      {
        programAllowlist: true,
        includeStandardPrograms: true,
        recipientMode: mode,
        recipientAllowlist: mode === "allowlist" ? allowlist : [],
      },
      onBack,
    );
  }

  const statusTitle = !protectionsOn
    ? copy.wallet.sendProtectionsOff
    : restricted
      ? copy.wallet.recipientsRestricted
      : copy.wallet.recipientsAllAllowed;
  const statusBody = !protectionsOn
    ? copy.wallet.sendProtectionsRequired
    : restricted
      ? copy.wallet.recipientsRestrictedBody
      : copy.wallet.recipientsAnyoneActiveBody;

  const showSave =
    protectionsOn &&
    (mode === "allowlist" ||
      (protectionsOn && effectiveMode === "allowlist"));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.recipients}
      />
      {editor.loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {copy.common.loading}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {copy.wallet.recipientsHint}
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
                  ? copy.wallet.recipientsAdvancedHide
                  : copy.wallet.recipientsAdvanced}
                {advancedOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </Button>

              {advancedOpen ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    {copy.wallet.recipientsAdvancedHint}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mode === "anyone" ? "default" : "outline"}
                      className="flex-1 rounded-full"
                      onClick={() => setMode("anyone")}
                    >
                      {copy.wallet.recipientsAnyone}
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "allowlist" ? "default" : "outline"}
                      className="flex-1 rounded-full"
                      onClick={() => setMode("allowlist")}
                    >
                      {copy.wallet.recipientsAllowlist}
                    </Button>
                  </div>

                  {mode === "allowlist" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={copy.wallet.pasteAddress}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={copy.wallet.tapAccessory}
                          onClick={() => void pickNfc()}
                        >
                          <Nfc className="size-4" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => addAddress(draft)}
                      >
                        {copy.wallet.add}
                      </Button>
                      {allowlist.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {copy.wallet.recipientsEmpty}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {allowlist.map((addr) => (
                            <li
                              key={addr}
                              className="flex items-center justify-between rounded-xl bg-muted/25 px-3 py-2 text-sm"
                            >
                              <span className="font-mono">
                                {shortAddress(addr, 6)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={copy.common.remove}
                                onClick={() =>
                                  setAllowlist((prev) =>
                                    prev.filter((a) => a !== addr),
                                  )
                                }
                              >
                                <Trash2 className="size-4 text-muted-foreground" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {showSave ? (
                    <Button
                      type="button"
                      size="lg"
                      className="w-full rounded-full"
                      disabled={editor.busy}
                      onClick={() => void save()}
                    >
                      {editor.saving ? (
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
        </>
      )}
    </div>
  );
}
