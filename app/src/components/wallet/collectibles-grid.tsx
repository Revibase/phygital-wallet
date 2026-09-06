"use client";

import type { WalletCollectible } from "@/lib/wallet/portfolio-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Collectibles — horizontal strip on home, airy grid on See all. */
export function CollectiblesGrid({
  collectibles,
  onSelect,
  className,
  layout = "grid",
}: {
  collectibles: WalletCollectible[];
  onSelect: (c: WalletCollectible) => void;
  className?: string;
  layout?: "grid" | "strip";
}) {
  if (collectibles.length === 0) return null;

  if (layout === "strip") {
    return (
      <ul
        className={cn(
          "flex gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {collectibles.map((c) => (
          <li key={c.mint} className="w-28 shrink-0">
            <CollectibleTile collectible={c} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3",
        className,
      )}
    >
      {collectibles.map((c) => (
        <li key={c.mint}>
          <CollectibleTile collectible={c} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function CollectibleTile({
  collectible: c,
  onSelect,
}: {
  collectible: WalletCollectible;
  onSelect: (c: WalletCollectible) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(c)}
      className="group h-auto min-h-0 w-full flex-col items-stretch gap-0 overflow-hidden rounded-2xl p-0 text-left font-normal hover:bg-transparent hover:opacity-90 active:opacity-80"
    >
      <span className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-[0_8px_24px_-12px_var(--card-shadow)]">
        {c.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted via-muted/80 to-background"
            aria-hidden
          >
            <span className="text-3xl font-medium tracking-tight text-muted-foreground/45">
              {(c.name.trim().charAt(0) || "?").toUpperCase()}
            </span>
          </span>
        )}
      </span>
      <span className="mt-2 truncate px-0.5 text-sm font-medium">{c.name}</span>
      {c.collectionName ? (
        <span className="truncate px-0.5 text-xs text-muted-foreground">
          {c.collectionName}
        </span>
      ) : null}
    </Button>
  );
}
