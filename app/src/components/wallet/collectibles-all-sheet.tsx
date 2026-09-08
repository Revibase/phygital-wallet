"use client";

import { useMemo, useState } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { CollectiblesGrid } from "@/components/wallet/collectibles-grid";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/copy/phygital";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";
import {
  ALL_LIST_SEARCH_THRESHOLD,
  sortCollectibles,
} from "@/lib/wallet/portfolio-preview";

/** Full collectibles inventory — search when the list is long. */
export function CollectiblesAllSheet({
  collectibles,
  linkedMint,
  onBack,
  onSelect,
}: {
  collectibles: WalletCollectible[];
  linkedMint?: string | null;
  onBack: () => void;
  onSelect: (c: WalletCollectible) => void;
}) {
  const sorted = useMemo(
    () => sortCollectibles(collectibles, linkedMint),
    [collectibles, linkedMint],
  );
  const [query, setQuery] = useState("");
  const showSearch = sorted.length >= ALL_LIST_SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.collectionName?.toLowerCase().includes(q) ?? false) ||
        c.mint.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        align="start"
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.collectibles}
      />

      {showSearch ? (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.wallet.searchCollectibles}
          className="mx-1"
          autoCapitalize="off"
          autoCorrect="off"
        />
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {copy.wallet.noMatchingCollectibles}
        </p>
      ) : (
        <CollectiblesGrid
          collectibles={filtered}
          onSelect={onSelect}
          className="px-1 pb-4"
        />
      )}
    </div>
  );
}
