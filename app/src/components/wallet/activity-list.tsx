"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BellRing, Clock3, RefreshCcw } from "lucide-react";

import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { ActivityReceiptSheet } from "@/components/wallet/activity-receipt-sheet";
import { Button } from "@/components/ui/button";
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
  assetMetaByMint?: Record<string, { symbol: string; name: string }>,
) {
  if (assetMetaByMint?.[mint]?.symbol) return assetMetaByMint[mint]!.symbol;
  if (isNativeSolMint(mint)) return "SOL";
  return shortAddress(mint, 4);
}

/** Compact relative time — Phantom/Backpack-style trailing label. */
function formatActivityTime(timestamp: number | null): string {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp * 1000;
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`;
  if (diffMs < 86_400_000 * 7) return `${Math.floor(diffMs / 86_400_000)}d`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ActivityList({
  items,
  onLoadMore,
  hasMore,
  loadingMore,
  emptyLabel,
  assetMetaByMint,
  className,
}: {
  items: WalletActivityItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  emptyLabel: string;
  assetMetaByMint?: Record<string, { symbol: string; name: string }>;
  className?: string;
}) {
  const [selected, setSelected] = useState<WalletActivityItem | null>(null);

  if (items.length === 0) {
    return (
      <p className={cn("px-4 py-8 text-center text-sm text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <GroupedList>
        {items.map((item) => {
          const Icon = iconForKind(item.kind);
          // Phantom: subtitle = counterparty when known; else omit (Failed via statusLabel).
          const subtitle = item.subtitle
            ? shortAddress(item.subtitle, 4)
            : item.statusLabel;

          const deltas = item.balanceDeltas ?? [];
          const deltaRows =
            deltas.length > 0 ? (
              <div className="flex flex-col items-end gap-0.5">
                {deltas.slice(0, 2).map((d) => {
                  const color =
                    d.direction === "in" ? "text-success" : "text-destructive";
                  return (
                    <p
                      key={`${item.id}:${d.mint}:${d.direction}`}
                      className={cn("text-sm tabular-nums", color)}
                    >
                      {d.direction === "in" ? "+" : "-"}
                      {d.amountUi} {symbolForMint(d.mint, assetMetaByMint)}
                    </p>
                  );
                })}
                {deltas.length > 2 ? (
                  <p className="text-xs text-muted-foreground">
                    +{deltas.length - 2} more
                  </p>
                ) : null}
              </div>
            ) : item.amountLabel ? (
              <p
                className={cn(
                  "text-sm tabular-nums",
                  item.kind === "received"
                    ? "text-success"
                    : item.kind === "sent"
                      ? "text-destructive"
                      : undefined,
                )}
              >
                {item.amountLabel}
                {item.mint
                  ? ` ${symbolForMint(item.mint, assetMetaByMint)}`
                  : ""}
              </p>
            ) : null;

          const timeLabel = item.pending
            ? "Pending"
            : formatActivityTime(item.timestamp);

          return (
            <GroupedRow
              key={item.id}
              onClick={() => setSelected(item)}
              leading={
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
              }
              subtitle={subtitle}
              trailing={
                <div className="shrink-0 text-right">
                  {deltaRows}
                  {timeLabel ? (
                    <p className="text-xs text-muted-foreground">{timeLabel}</p>
                  ) : null}
                </div>
              }
            >
              {item.title}
            </GroupedRow>
          );
        })}
      </GroupedList>
      {hasMore && onLoadMore ? (
        <Button
          type="button"
          variant="link"
          onClick={onLoadMore}
          className="mx-auto h-auto min-h-0 gap-2 px-0 text-xs font-medium"
        >
          {loadingMore ? <RefreshCcw className="size-3.5 animate-spin" aria-hidden /> : null}
          See more
        </Button>
      ) : null}
      <ActivityReceiptSheet
        item={selected}
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        assetMetaByMint={assetMetaByMint}
      />
    </div>
  );
}
