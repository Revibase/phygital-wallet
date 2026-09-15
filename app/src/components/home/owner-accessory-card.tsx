"use client";

import { memo } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { cn, shortAddress } from "@/lib/utils";

/**
 * One accessory tile on the owner dashboard. Resolves display metadata
 * (phygital token PDA → linked `mint` → DAS collectible) and, on click, asks
 * the parent to run the tap ceremony for this token.
 */
export const OwnerAccessoryCard = memo(function OwnerAccessoryCard({
  phygitalToken,
  busy = false,
  onOpen,
}: {
  phygitalToken: string;
  busy?: boolean;
  onOpen: (phygitalToken: string) => void;
}) {
  const tokenQuery = usePhygitalTokenByAddress(phygitalToken);
  const mint = tokenQuery.data?.mint ? String(tokenQuery.data.mint) : null;
  const { collectible } = useResolvedDasCollectible(mint, {
    enabled: Boolean(mint),
  });

  const name = collectible?.name ?? shortAddress(phygitalToken);
  const image = collectible?.image ?? null;

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={() => onOpen(phygitalToken)}
      className="group h-auto min-h-0 w-full flex-col items-stretch gap-0 overflow-hidden rounded-2xl p-0 text-left font-normal hover:bg-transparent hover:opacity-90 active:opacity-80"
    >
      <span className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-[0_8px_24px_-12px_var(--card-shadow)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
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
              {(name.trim().charAt(0) || "?").toUpperCase()}
            </span>
          </span>
        )}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm transition-opacity",
            busy ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={!busy}
        >
          <Spinner className="size-6" />
        </span>
      </span>
      <span className="mt-2 truncate px-0.5 text-sm font-medium">{name}</span>
      {collectible?.collectionName ? (
        <span className="truncate px-0.5 text-xs text-muted-foreground">
          {collectible.collectionName}
        </span>
      ) : null}
    </Button>
  );
});
