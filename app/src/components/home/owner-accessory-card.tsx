"use client";

import { memo } from "react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { copy } from "@/lib/copy/phygital";
import { galleryAnimate, staggerStyle } from "@/lib/motion";
import { tokenHasLinkedMint, type PhygitalToken } from "@/lib/phygital/token";
import type { Collectible } from "@/lib/tokens/collectible";
import { cn, shortAddress } from "@/lib/utils";

/**
 * One accessory tile on the owner dashboard. Prefer prefetched `token` /
 * `collectible` from the batched home query; falls back to per-card hooks.
 */
export const OwnerAccessoryCard = memo(function OwnerAccessoryCard({
  phygitalToken,
  token: tokenProp,
  collectible: collectibleProp,
  busy = false,
  index = 0,
  onOpen,
}: {
  phygitalToken: string;
  token?: PhygitalToken | null;
  collectible?: Collectible | null;
  busy?: boolean;
  index?: number;
  onOpen: (phygitalToken: string) => void;
}) {
  const tokenQuery = usePhygitalTokenByAddress(
    tokenProp === undefined ? phygitalToken : null,
  );
  const token = tokenProp !== undefined ? tokenProp : tokenQuery.data;
  const hasMint = Boolean(token && tokenHasLinkedMint(token));
  const mint = hasMint && token?.mint ? String(token.mint) : null;
  const { collectible: collectibleHook, loading: collectibleLoading } =
    useResolvedDasCollectible(collectibleProp === undefined ? mint : null, {
      enabled: collectibleProp === undefined && Boolean(mint),
    });
  const collectible =
    collectibleProp !== undefined ? collectibleProp : collectibleHook;

  const resolving =
    (tokenProp === undefined && tokenQuery.isPending) ||
    (collectibleProp === undefined && Boolean(mint) && collectibleLoading);
  const hasArt = Boolean(collectible?.image);
  const title =
    collectible?.name?.trim() ||
    (hasMint ? copy.home.card : copy.home.accessory);
  const subtitle = token?.owner
    ? shortAddress(String(token.owner))
    : resolving
    ? copy.home.loadingWallet
    : copy.home.walletUnknown;

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={() => onOpen(phygitalToken)}
      style={staggerStyle(index)}
      className={cn(
        "group h-auto min-h-0 w-full flex-col items-stretch gap-0 rounded-none p-0 text-left font-normal whitespace-normal",
        "hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/60",
        galleryAnimate.rise,
      )}
    >
      <span
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-[1.25rem]",
          "bg-card ring-1 ring-border/70 transition-[box-shadow,transform,ring-color]",
          "shadow-[0_10px_28px_-16px_var(--card-shadow)]",
          "group-hover:ring-foreground/15 group-hover:shadow-[0_14px_32px_-14px_var(--card-shadow)]",
          "group-active:scale-[0.985]",
        )}
      >
        {resolving && !hasArt ? (
          <Skeleton className="absolute inset-0" />
        ) : hasArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={collectible!.image!}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-linear-to-br from-secondary via-card to-muted"
            aria-hidden
          >
            <RevibaseMark
              variant="digital"
              className="size-10 opacity-80 sm:size-11"
            />
          </span>
        )}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px] transition-opacity",
            busy ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!busy}
        >
          <Spinner className="size-6" />
        </span>
      </span>
      <span className="mt-2.5 flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-medium tracking-tight text-foreground">
          {resolving && !collectible?.name ? (
            <Skeleton className="h-4 w-3/5" />
          ) : (
            title
          )}
        </span>
        <span className="truncate font-mono text-[11px] leading-4 tracking-tight text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </Button>
  );
});
