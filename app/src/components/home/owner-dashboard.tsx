"use client";

import { Plus } from "lucide-react";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OwnerAccessoryCard } from "@/components/home/owner-accessory-card";
import { OwnerAccountMenu } from "@/components/home/owner-account-menu";
import { useTapToOpen } from "@/hooks/token/use-tap-to-open";
import { useOpenOwnedAccessory } from "@/hooks/wallet/use-open-owned-accessory";
import { useOwnedAccessories } from "@/hooks/wallet/use-owned-accessories";
import { useOwnedAccessoryDetails } from "@/hooks/wallet/use-owned-accessory-details";
import { copy } from "@/lib/copy/phygital";
import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Signed-in home: every accessory the owner controls.
 * Known cards quietly mint owner_browse (no Hold / no Face ID when session live).
 * “Open another” still Holds first (token unknown until the tap).
 */
export function OwnerDashboard({ owner }: { owner: string }) {
  const accessories = useOwnedAccessories(owner);
  const tokens = accessories.data ?? [];
  // Prefetch token accounts so later wallet routes hit warm cache.
  useOwnedAccessoryDetails(
    accessories.isSuccess && tokens.length > 0 ? tokens : undefined,
  );
  const tap = useTapToOpen();
  const { open: openOwned, openingToken } = useOpenOwnedAccessory();

  if (tap.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  const isEmpty = accessories.isSuccess && tokens.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 py-1 sm:gap-6 sm:py-2">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-large-title tracking-tight">
            {copy.home.accessories}
          </h1>
          {!accessories.isPending && !isEmpty ? (
            <p className="text-sm text-muted-foreground">
              {copy.home.accessoriesCount(tokens.length)}
            </p>
          ) : null}
        </div>
        <OwnerAccountMenu className="shrink-0" />
      </header>

      {accessories.isPending ? (
        <GroupedList className={galleryAnimate.rise}>
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex min-h-11 items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </li>
          ))}
        </GroupedList>
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
            {tap.holding ? (
              <>
                <Spinner className="size-4" />
                {copy.verify.holdStill}
              </>
            ) : (
              copy.home.emptyOpenCta
            )}
          </Button>
          {tap.error ? (
            <p className="text-xs text-destructive">{tap.error}</p>
          ) : null}
        </div>
      ) : (
        <div className={cn("flex flex-col gap-3", galleryAnimate.rise)}>
          <GroupedList>
            {tokens.map((token) => (
              <OwnerAccessoryCard
                key={token}
                phygitalToken={token}
                busy={openingToken === token}
                onOpen={(t) => void openOwned(t)}
              />
            ))}
          </GroupedList>
          <GroupedList>
            <GroupedRow
              onClick={tap.holding ? undefined : () => void tap.open()}
              leading={
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/80 text-foreground/80">
                  {tap.holding ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Plus className="size-4" strokeWidth={2} aria-hidden />
                  )}
                </span>
              }
            >
              {tap.holding ? copy.verify.holdStill : copy.home.openAnother}
            </GroupedRow>
          </GroupedList>
          {tap.error ? (
            <p className="px-1 text-xs text-destructive">{tap.error}</p>
          ) : null}
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
