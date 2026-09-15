"use client";

import { useRouter } from "next/navigation";

import { InAppBrowserGate } from "@/components/shared/in-app-browser-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OwnerAccessoryCard } from "@/components/home/owner-accessory-card";
import { OwnerAccountMenu } from "@/components/home/owner-account-menu";
import { useTapToOpen } from "@/hooks/token/use-tap-to-open";
import { useOwnedAccessories } from "@/hooks/wallet/use-owned-accessories";
import { copy } from "@/lib/copy/phygital";
import { tokenHref } from "@/lib/wallet/token-routes";

/**
 * Signed-in home: every accessory the owner controls.
 * Known cards navigate to `/token/:address` — middleware admits if the
 * browse-unlock cookie is valid, otherwise redirects to Hold (`…/unlock`).
 * “Open another” still Holds first (token unknown until the tap).
 */
export function OwnerDashboard({ owner }: { owner: string }) {
  const router = useRouter();
  const accessories = useOwnedAccessories(owner);
  const tap = useTapToOpen();

  if (tap.showInAppGate) {
    return <InAppBrowserGate body={copy.gate.openInBrowserBody} />;
  }

  const tokens = accessories.data ?? [];
  const isEmpty = accessories.isSuccess && tokens.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 py-2">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-display-md tracking-tight">
          {copy.home.accessories}
        </h1>
        <OwnerAccountMenu />
      </header>

      {accessories.isPending ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="mt-2 h-4 w-2/3 rounded" />
            </li>
          ))}
        </ul>
      ) : isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="max-w-xs space-y-2">
            <p className="text-base font-medium">{copy.home.emptyTitle}</p>
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
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {tokens.map((token) => (
              <li key={token}>
                <OwnerAccessoryCard
                  phygitalToken={token}
                  onOpen={(t) => router.push(tokenHref(t))}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={tap.holding}
              onClick={() => void tap.open()}
            >
              {tap.holding
                ? copy.wallet.holdToOpenTitle
                : copy.home.openAnother}
            </Button>
            {tap.error ? (
              <p className="text-xs text-destructive">{tap.error}</p>
            ) : null}
          </div>
        </>
      )}

      {accessories.isError ? (
        <p className="text-center text-xs text-destructive">
          Couldn’t load your accessories.
        </p>
      ) : null}
    </div>
  );
}
