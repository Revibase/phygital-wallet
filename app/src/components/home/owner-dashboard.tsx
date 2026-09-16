"use client";

import { useMemo, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OwnerAccessoryCard } from "@/components/home/owner-accessory-card";
import { OwnerAccountMenu } from "@/components/home/owner-account-menu";
import { useTapToOpen } from "@/hooks/token/use-tap-to-open";
import { useOpenOwnedAccessory } from "@/hooks/wallet/use-open-owned-accessory";
import { useOwnedAccessories } from "@/hooks/wallet/use-owned-accessories";
import { useOwnedAccessoryDetails } from "@/hooks/wallet/use-owned-accessory-details";
import { copy } from "@/lib/copy/phygital";
import { galleryAnimate, staggerStyle } from "@/lib/motion";
import { tokenHasLinkedMint } from "@/lib/phygital/token";
import type { OwnedAccessoryDetails } from "@/hooks/wallet/use-owned-accessory-details";
import { cn } from "@/lib/utils";

/**
 * Signed-in home: every accessory the owner controls.
 * Known cards quietly mint owner_browse (no Hold / no Face ID when session live).
 * “Open another” still Holds first (token unknown until the tap).
 */
export function OwnerDashboard({ owner }: { owner: string }) {
  const accessories = useOwnedAccessories(owner);
  const tokens = accessories.data ?? [];
  const details = useOwnedAccessoryDetails(
    accessories.isSuccess && tokens.length > 0 ? tokens : undefined,
  );
  const tap = useTapToOpen();
  const { open: openOwned, openingToken } = useOpenOwnedAccessory();

  const sections = useMemo(() => {
    const minted: string[] = [];
    const unminted: string[] = [];
    if (!details.data) {
      // While details load, keep a single section so skeletons aren't split.
      return { minted: [] as string[], unminted: tokens };
    }
    for (const pda of tokens) {
      const token = details.data.tokens.get(pda);
      if (token && tokenHasLinkedMint(token)) minted.push(pda);
      else unminted.push(pda);
    }
    return { minted, unminted };
  }, [details.data, tokens]);

  if (tap.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  const isEmpty = accessories.isSuccess && tokens.length === 0;
  const showMinted = sections.minted.length > 0;
  const linkedCount = sections.minted.length + sections.unminted.length;
  const detailsMap = details.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 py-1 sm:gap-6 sm:py-2">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-large-title tracking-tight">
            {copy.home.accessories}
          </h1>
          {!accessories.isPending && !isEmpty ? (
            <p className="text-sm text-muted-foreground">
              {copy.home.accessoriesCount(linkedCount)}
            </p>
          ) : null}
        </div>
        <OwnerAccountMenu className="shrink-0" />
      </header>

      {accessories.isPending ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} style={staggerStyle(i)} className={galleryAnimate.rise}>
              <Skeleton className="aspect-square w-full rounded-[1.25rem]" />
              <Skeleton className="mt-2.5 h-4 w-2/3 rounded" />
              <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
            </li>
          ))}
        </ul>
      ) : isEmpty ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-12 text-center",
            galleryAnimate.rise,
          )}
        >
          <div className="max-w-xs space-y-2">
            <p className="text-base font-medium tracking-tight">
              {copy.home.emptyTitle}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {copy.home.emptyBody}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full max-w-64 rounded-full"
            disabled={tap.holding}
            onClick={() => void tap.open()}
          >
            {tap.holding
              ? copy.wallet.holdToOpenTitle
              : copy.home.emptyOpenCta}
          </Button>
          {tap.error ? (
            <p className="text-xs text-destructive">{tap.error}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {showMinted ? (
            <AccessorySection
              title={copy.home.cards}
              tokens={sections.minted}
              details={detailsMap}
              openingToken={openingToken}
              onOpen={(t) => void openOwned(t)}
            />
          ) : null}
          <AccessorySection
            title={showMinted ? copy.home.accessories : undefined}
            tokens={sections.unminted}
            details={detailsMap}
            openingToken={openingToken}
            onOpen={(t) => void openOwned(t)}
            trailingTile={
              <OpenAnotherTile
                index={sections.unminted.length}
                holding={tap.holding}
                error={tap.error}
                onOpen={() => void tap.open()}
              />
            }
          />
        </div>
      )}

      {accessories.isError ? (
        <p className="text-center text-xs text-destructive">
          {copy.home.accessoriesLoadFailed}
        </p>
      ) : null}
    </div>
  );
}

function AccessorySection({
  title,
  tokens,
  details,
  trailingTile,
  openingToken,
  onOpen,
}: {
  title?: string;
  tokens: string[];
  details?: OwnedAccessoryDetails;
  trailingTile?: ReactNode;
  openingToken: string | null;
  onOpen: (phygitalToken: string) => void;
}) {
  if (tokens.length === 0 && !trailingTile) return null;

  return (
    <section className="space-y-3">
      {title ? (
        <h2 className="px-0.5 text-sm font-medium tracking-tight text-foreground">
          {title}
        </h2>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tokens.map((token, index) => {
          const phygital = details?.tokens.get(token);
          const mint =
            phygital && tokenHasLinkedMint(phygital)
              ? String(phygital.mint)
              : null;
          const collectible = mint
            ? (details?.collectibles[mint] ?? null)
            : null;
          return (
            <li key={token}>
              <OwnerAccessoryCard
                phygitalToken={token}
                token={details ? (phygital ?? null) : undefined}
                collectible={
                  details
                    ? mint
                      ? collectible
                      : null
                    : undefined
                }
                index={index}
                busy={openingToken === token}
                onOpen={onOpen}
              />
            </li>
          );
        })}
        {trailingTile ? <li>{trailingTile}</li> : null}
      </ul>
    </section>
  );
}

function OpenAnotherTile({
  index,
  holding,
  error,
  onOpen,
}: {
  index: number;
  holding: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={holding}
        onClick={onOpen}
        style={staggerStyle(index)}
        className={cn(
          "group h-auto min-h-0 w-full flex-col items-stretch gap-0 rounded-[1.25rem] p-0 font-normal",
          "hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/60",
          galleryAnimate.rise,
        )}
      >
        <span
          className={cn(
            "relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.25rem]",
            "border border-dashed border-border/90 bg-card/40 text-muted-foreground",
            "transition-[border-color,background-color,color,transform]",
            "group-hover:border-foreground/25 group-hover:bg-card/80 group-hover:text-foreground",
            "group-active:scale-[0.985]",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary/80 text-foreground/80 transition-colors group-hover:bg-secondary">
            <Plus className="size-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="px-3 text-center text-sm font-medium tracking-tight">
            {holding ? copy.wallet.holdToOpenTitle : copy.home.openAnother}
          </span>
        </span>
      </Button>
      {error ? (
        <p className="px-0.5 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
