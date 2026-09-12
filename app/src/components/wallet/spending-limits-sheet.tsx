"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { TokenIcon } from "@/components/shared/token-chip";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { usePolicyEditor } from "@/hooks/wallet/use-wallet-policy";
import { useVerifiedTokens } from "@/hooks/wallet/use-verified-tokens";
import { copy } from "@/lib/copy/phygital";
import { toUserErrorMessage } from "@/lib/user-errors";
import { NATIVE_SOL_MINT, type PaymentToken } from "@/lib/tokens/payment-token";
import { getUsdcMint, USDC_DECIMALS } from "@/lib/tokens/usdc-mint";
import { shortAddress } from "@/lib/utils";
import { ALL_LIST_SEARCH_THRESHOLD } from "@/lib/wallet/portfolio-preview";
import {
  defaultUsdcMintCap,
  FIRST_ENABLE_POLICY_SETTINGS,
  type MintSpendCapSetting,
} from "@/lib/wallet/policy-settings";

function formatCap(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(n);
}

function mintLabel(cap: MintSpendCapSetting): string {
  return cap.symbol?.trim() || shortAddress(cap.mint, 4);
}

function cloneCaps(
  caps: readonly MintSpendCapSetting[]
): MintSpendCapSetting[] {
  return caps.map((c) => ({ ...c }));
}

function metaFromCatalog(
  tokens: readonly PaymentToken[] | undefined
): Map<string, { decimals: number; symbol?: string }> {
  const map = new Map<string, { decimals: number; symbol?: string }>();
  map.set(String(getUsdcMint()), { decimals: USDC_DECIMALS, symbol: "USDC" });
  for (const t of tokens ?? []) {
    if (t.mint === NATIVE_SOL_MINT) continue;
    map.set(t.mint, {
      decimals: t.decimals,
      symbol: t.symbol?.trim() || undefined,
    });
  }
  return map;
}

function enrichCaps(
  caps: readonly MintSpendCapSetting[],
  meta: Map<string, { decimals: number; symbol?: string }>
): MintSpendCapSetting[] {
  return caps.map((c) => {
    const hint = meta.get(c.mint);
    if (!hint) return { ...c };
    return {
      ...c,
      decimals: hint.decimals,
      symbol: hint.symbol ?? c.symbol,
    };
  });
}

/** Max per-send mint / SOL caps on the built-in send surface. */
export function SpendingLimitsSheet({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const editor = usePolicyEditor(phygitalTokenPda);
  const verified = useVerifiedTokens();
  const catalog = useMemo(
    () => (verified.data ?? []).filter((t) => t.mint !== NATIVE_SOL_MINT),
    [verified.data]
  );
  const catalogMeta = useMemo(() => metaFromCatalog(catalog), [catalog]);

  const [mintLimits, setMintLimits] = useState<MintSpendCapSetting[]>([]);
  const [maxSol, setMaxSol] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (verified.isError) toast.error(toUserErrorMessage(verified.error));
  }, [verified.isError, verified.error]);

  useEffect(() => {
    if (!editor.settings) return;
    if (editor.spendCapsEnabled) {
      setMintLimits(
        enrichCaps(cloneCaps(editor.settings.mintLimits), catalogMeta)
      );
      setMaxSol(editor.settings.maxTransferSol ?? "");
    } else {
      setMintLimits(
        enrichCaps(
          cloneCaps(FIRST_ENABLE_POLICY_SETTINGS.mintLimits),
          catalogMeta
        )
      );
      setMaxSol(FIRST_ENABLE_POLICY_SETTINGS.maxTransferSol ?? "0.1");
    }
  }, [editor.settings, editor.spendCapsEnabled, catalogMeta]);

  const protectionsOn = editor.policyEnabled;
  const enabled = editor.spendCapsEnabled;
  const invalid = editor.policyInvalid;
  const extras = editor.settings?.extraPrograms.length ?? 0;
  const addedMints = useMemo(
    () => new Set(mintLimits.map((c) => c.mint)),
    [mintLimits]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const available = catalog.filter((t) => !addedMints.has(t.mint));
    if (!q) return available;
    return available.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q)
    );
  }, [catalog, search, addedMints]);

  const showSearch = catalog.length >= ALL_LIST_SEARCH_THRESHOLD;
  const catalogLoading = verified.isLoading && !verified.data;

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
        (editor.settings?.mintLimits ?? []).map((c) => ({
          label: mintLabel(c),
          amount: formatCap(c.maxUi),
        })),
        formatCap(editor.settings?.maxTransferSol)
      )
    : copy.wallet.spendingLimitsOffBody;

  function addVerifiedToken(token: PaymentToken) {
    if (token.mint === NATIVE_SOL_MINT) {
      toast.error(copy.wallet.spendingLimitsUseSolField);
      return;
    }
    if (addedMints.has(token.mint)) {
      toast.error(copy.wallet.spendingLimitsMintAlreadyAdded);
      return;
    }
    setMintLimits([
      ...mintLimits,
      {
        mint: token.mint,
        maxUi: token.mint === String(getUsdcMint()) ? "50" : "",
        decimals: token.decimals,
        symbol: token.symbol?.trim() || undefined,
      },
    ]);
    setPickerOpen(false);
    setSearch("");
  }

  function updateCapAmount(mint: string, maxUi: string) {
    setMintLimits((prev) =>
      prev.map((c) =>
        c.mint === mint ? { ...c, maxUi: maxUi.replace(/[^0-9.]/g, "") } : c
      )
    );
  }

  function removeCap(mint: string) {
    setMintLimits((prev) => prev.filter((c) => c.mint !== mint));
  }

  function saveCaps() {
    const cleaned = mintLimits
      .map((c) => ({ ...c, maxUi: c.maxUi.trim() }))
      .filter((c) => c.maxUi !== "");
    const sol = maxSol.trim() || null;
    if (cleaned.length === 0 && !sol) {
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
        mintLimits: cleaned,
        maxTransferSol: sol,
      },
      onBack
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

                  <FieldLabel className="normal-case tracking-normal text-xs">
                    {copy.wallet.mintSpendCaps}
                  </FieldLabel>

                  {mintLimits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {copy.wallet.mintSpendCapsEmpty}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {mintLimits.map((cap) => (
                        <li
                          key={cap.mint}
                          className="rounded-2xl bg-muted/25 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {mintLabel(cap)}
                              </p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {shortAddress(cap.mint, 6)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              onClick={() => removeCap(cap.mint)}
                              aria-label={copy.wallet.mintSpendCapsRemove}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <FieldLabel className="mt-2 normal-case tracking-normal text-xs">
                            {copy.wallet.maxMintPerSend}
                          </FieldLabel>
                          <Input
                            inputMode="decimal"
                            value={cap.maxUi}
                            onChange={(e) =>
                              updateCapAmount(cap.mint, e.target.value)
                            }
                            placeholder="50"
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full rounded-full"
                    disabled={catalogLoading || catalog.length === 0}
                    onClick={() => setPickerOpen(true)}
                  >
                    {catalogLoading ? (
                      <Spinner className="size-4" />
                    ) : (
                      copy.wallet.mintSpendCapsAddCta
                    )}
                  </Button>

                  {mintLimits.length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-full"
                      onClick={() =>
                        setMintLimits(
                          enrichCaps([defaultUsdcMintCap()], catalogMeta)
                        )
                      }
                    >
                      {copy.wallet.mintSpendCapsAddUsdc}
                    </Button>
                  ) : null}

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

      <Sheet
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setSearch("");
        }}
      >
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-t-3xl md:rounded-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{copy.wallet.mintSpendCapsPickTitle}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {showSearch ? (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.wallet.searchTokens}
                className="text-sm"
              />
            ) : null}
            {catalogLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {copy.common.loading}
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {addedMints.size > 0 && catalog.length > 0
                  ? copy.wallet.mintSpendCapsNoneLeft
                  : copy.wallet.noMatchingTokens}
              </p>
            ) : (
              <GroupedList>
                {filtered.map((t) => (
                  <GroupedRow
                    key={t.mint}
                    leading={<TokenIcon token={t} className="size-8" />}
                    subtitle={t.name}
                    onClick={() => addVerifiedToken(t)}
                  >
                    {t.symbol}
                  </GroupedRow>
                ))}
              </GroupedList>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
