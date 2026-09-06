"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Separator } from "@/components/ui/separator";
import { copy } from "@/lib/copy/phygital";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";
import { collectibleInterfaceLabel } from "@/lib/wallet/send-asset-ref";

/** Full-screen collectible detail — art, collection, Send (workspace stage). */
export function CollectibleDetailSheet({
  collectible,
  onBack,
  onSend,
  onOpenCard,
}: {
  collectible: WalletCollectible;
  onBack: () => void;
  onSend: (c: WalletCollectible) => void;
  onOpenCard?: () => void;
}) {
  const badge = collectibleInterfaceLabel(collectible);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <NavBar
        className="mb-0"
        leading={<NavBarBack onClick={onBack} className="-ml-2 text-muted-foreground hover:text-foreground" />}
        title={collectible.name}
      />

      <div className="flex flex-1 flex-col gap-4">
        <div className="overflow-hidden rounded-3xl bg-muted">
          {collectible.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={collectible.image}
              alt=""
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-linear-to-br from-muted via-muted/70 to-background">
              <span className="font-(family-name:--font-display) text-7xl font-medium tracking-tight text-muted-foreground/40">
                {(collectible.name.trim().charAt(0) || "?").toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2 px-0.5">
          {collectible.collectionName ? (
            <p className="text-sm text-muted-foreground">
              {collectible.collectionName}
            </p>
          ) : null}
          <Badge variant="secondary">{badge}</Badge>
        </div>

        <Separator />

        <div className="flex flex-col gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => onSend(collectible)}
          >
            {copy.wallet.send}
          </Button>
          {onOpenCard ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onOpenCard}
            >
              {copy.wallet.openCard}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
