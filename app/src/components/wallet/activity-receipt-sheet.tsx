"use client";

import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Clock3,
  Copy,
  ExternalLink,
} from "lucide-react";

import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { copy } from "@/lib/copy/phygital";
import { explorerTxUrl } from "@/lib/solana/cluster";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";
import { cn, shortAddress } from "@/lib/utils";

function iconForKind(kind: WalletActivityItem["kind"]) {
  switch (kind) {
    case "sent":
      return ArrowUpRight;
    case "received":
      return ArrowDownLeft;
    case "approved":
      return BellRing;
    default:
      return Clock3;
  }
}

function isNativeSolMint(mint: string): boolean {
  return (
    mint === NATIVE_SOL_MINT ||
    mint === "SOL" ||
    mint.startsWith("So1111111111111111111111111111111111111111")
  );
}

function symbolForMint(
  mint: string,
  assetMetaByMint?: Record<string, { symbol: string; name: string }>
) {
  if (assetMetaByMint?.[mint]?.symbol) return assetMetaByMint[mint]!.symbol;
  if (isNativeSolMint(mint)) return "SOL";
  return shortAddress(mint, 4);
}

function formatReceiptTime(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ActivityReceiptSheet({
  item,
  open,
  onOpenChange,
  assetMetaByMint,
}: {
  item: WalletActivityItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetMetaByMint?: Record<string, { symbol: string; name: string }>;
}) {
  if (!item) return null;

  const Icon = iconForKind(item.kind);
  const deltas = item.balanceDeltas ?? [];
  const signature = item.signature;

  async function copySignature() {
    if (!signature) return;
    try {
      await navigator.clipboard.writeText(signature);
      toast.success(copy.wallet.copied);
    } catch {
      toast.error(copy.wallet.addressCopyFailed);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0 md:rounded-3xl"
      >
        <div className="flex flex-col gap-5 p-4 pb-8">
          <NavBar
            leading={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {copy.common.close}
              </Button>
            }
            title={copy.wallet.receiptDetails}
          />

          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-medium">{item.title}</p>
              {item.pending ? (
                <p className="text-xs font-medium text-muted-foreground">
                  {copy.wallet.receiptPending}
                </p>
              ) : null}
            </div>

            {deltas.length > 0 ? (
              <div className="flex flex-col items-center gap-0.5">
                {deltas.map((d) => (
                  <p
                    key={`${item.id}:${d.mint}:${d.direction}`}
                    className={cn(
                      "font-(family-name:--font-display) text-2xl tabular-nums",
                      d.direction === "in" ? "text-success" : "text-foreground"
                    )}
                  >
                    {d.direction === "in" ? "+" : "−"}
                    {d.amountUi} {symbolForMint(d.mint, assetMetaByMint)}
                  </p>
                ))}
              </div>
            ) : item.amountLabel ? (
              <p className="font-(family-name:--font-display) text-2xl tabular-nums">
                {item.amountLabel}
              </p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl bg-muted/20 text-sm">
            {item.subtitle ? (
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
                <span className="text-muted-foreground">
                  {item.kind === "received" ? copy.wallet.from : copy.wallet.to}
                </span>
                <span className="font-mono tabular-nums">
                  {shortAddress(item.subtitle, 6)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-muted-foreground">
                {copy.wallet.receiptTime}
              </span>
              <span>{formatReceiptTime(item.timestamp)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {signature ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => void copySignature()}
                >
                  <Copy className="size-4" aria-hidden />
                  {copy.wallet.copySignature}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="w-full gap-2"
                  asChild
                >
                  <a
                    href={explorerTxUrl(signature)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    {copy.wallet.viewOnExplorer}
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
