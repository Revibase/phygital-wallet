"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { CollectibleAttributes } from "@/components/token/collectible-attributes";
import { CollectibleDescription } from "@/components/token/collectible-description";
import { CollectibleDetails } from "@/components/token/collectible-details";
import { CollectibleHeader } from "@/components/token/collectible-header";
import { CollectibleHero } from "@/components/token/collectible-hero";
import { CollectibleShortcuts } from "@/components/token/collectible-shortcuts";
import { VerificationMetadataRow } from "@/components/token/authenticity-badge";
import { TokenDetails } from "@/components/token/token-details";
import { StatusPill } from "@/components/shared/status-pill";
import { StickyActions } from "@/components/shared/sticky-actions";
import { MotionSection } from "@/components/shared/motion-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMintedCollectibleView } from "@/hooks/token/use-minted-collectible-view";
import { useShortcutOpener } from "@/hooks/token/use-shortcut-opener";
import { copy } from "@/lib/copy/phygital";
import {
  filterShortcutChips,
  pickPrimaryCtaShortcut,
} from "@/lib/tokens/shortcuts";
import { detailSplitClass } from "@/lib/layout";
import { STICKY_ENTER_DELAY_MS } from "@/lib/motion";
import {
  tokenHasLinkedMint,
  type PhygitalToken,
} from "@/lib/phygital/token";

/**
 * Minted landing — art first, then verify / primary CTA; details collapsed.
 */
export function TokenMintedPanel({
  token,
  liveConfirmed,
  onHoldToCheck,
}: {
  token: PhygitalToken;
  liveConfirmed: boolean;
  onHoldToCheck?: () => void;
}) {
  const mint = tokenHasLinkedMint(token) ? String(token.mint) : null;
  const { collectible, shortcuts, loading } = useMintedCollectibleView(mint);
  const { openCollectibleShortcut, iframeSheet } = useShortcutOpener();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const primaryShortcut = liveConfirmed
    ? pickPrimaryCtaShortcut(shortcuts)
    : null;
  const chipShortcuts = filterShortcutChips(shortcuts, primaryShortcut);

  const shortcutCtx = useMemo(
    () => ({
      tokenId: mint,
      ownerAddress: String(token.currentOwner),
      collectionId: collectible?.collectionMint ?? null,
    }),
    [mint, token.currentOwner, collectible?.collectionMint],
  );

  const attributes = collectible?.attributes ?? [];

  const name = collectible?.name ?? copy.token.unnamedCard;
  const hasBelowFold =
    attributes.length > 0 ||
    Boolean(collectible?.description) ||
    Boolean(collectible) ||
    Boolean(mint);
  let stagger = 0;

  return (
    <div className="flex flex-1 flex-col">
      {iframeSheet}
      <div className={detailSplitClass}>
        <CollectibleHero
          src={collectible?.image ?? null}
          alt={name}
          fallbackLabel={name}
          loading={loading}
          reveal={!loading && Boolean(collectible?.image)}
          className="mx-auto w-full max-w-sm sm:max-w-md lg:sticky lg:top-4 lg:mx-0 lg:max-w-none"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-5 pb-4">
            <MotionSection staggerIndex={stagger++}>
              {collectible ? (
                <div className="flex flex-col gap-3">
                  {liveConfirmed ? (
                    <StatusPill
                      label={copy.wallet.statusVerifiedNow}
                      tone="success"
                      sealed
                      className="self-start"
                    />
                  ) : null}
                  <CollectibleHeader
                    name={collectible.name}
                    collectionName={collectible.collectionName}
                    collectionImage={collectible.collectionImage}
                  />
                </div>
              ) : loading ? (
                <Skeleton className="h-14 w-full rounded-xl" aria-hidden />
              ) : null}
            </MotionSection>

            <MotionSection staggerIndex={stagger++}>
              <div className="divide-y divide-border/40">
                <VerificationMetadataRow
                  liveConfirmed={liveConfirmed}
                  onVerify={onHoldToCheck}
                />
              </div>
            </MotionSection>

            {!liveConfirmed && chipShortcuts.length > 0 ? (
              <MotionSection staggerIndex={stagger++}>
                <p className="px-0.5 text-xs text-muted-foreground">
                  {copy.verify.verifyToUnlockShortcut}
                </p>
              </MotionSection>
            ) : null}

            {chipShortcuts.length > 0 ? (
              <MotionSection staggerIndex={stagger++}>
                <CollectibleShortcuts
                  shortcuts={chipShortcuts}
                  onOpenShortcut={(shortcut) =>
                    openCollectibleShortcut(shortcut, shortcutCtx)
                  }
                />
              </MotionSection>
            ) : null}

            {hasBelowFold ? (
              <MotionSection staggerIndex={stagger++}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="h-auto min-h-11 w-full justify-between rounded-2xl bg-grouped px-4 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  {detailsOpen
                    ? copy.token.hideDetails
                    : copy.token.provenance}
                  {detailsOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </MotionSection>
            ) : null}

            {detailsOpen ? (
              <div className="flex flex-col gap-5">
                {collectible && attributes.length > 0 ? (
                  <MotionSection staggerIndex={stagger++}>
                    <CollectibleAttributes attributes={attributes} />
                  </MotionSection>
                ) : null}

                {collectible?.description ? (
                  <MotionSection staggerIndex={stagger++}>
                    <CollectibleDescription
                      description={collectible.description}
                    />
                  </MotionSection>
                ) : null}

                {collectible ? (
                  <MotionSection staggerIndex={stagger++}>
                    <CollectibleDetails
                      collectionName={collectible.collectionName}
                      collectionImage={collectible.collectionImage}
                      collectionDescription={collectible.collectionDescription}
                    />
                  </MotionSection>
                ) : null}

                <MotionSection staggerIndex={stagger++}>
                  <TokenDetails
                    cardId={token.secp256r1PublicKey}
                    mint={mint}
                    mintOwner={collectible?.mintOwner}
                  />
                </MotionSection>
              </div>
            ) : null}
          </div>

          {primaryShortcut ? (
            <StickyActions enterDelayMs={STICKY_ENTER_DELAY_MS}>
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  className="w-full"
                  onClick={() =>
                    openCollectibleShortcut(primaryShortcut, shortcutCtx)
                  }
                >
                  {primaryShortcut.label}
                </Button>
            </StickyActions>
          ) : null}
        </div>
      </div>
    </div>
  );
}
