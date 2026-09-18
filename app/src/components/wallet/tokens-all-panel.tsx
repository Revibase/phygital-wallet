"use client";

import { useMemo, useState } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList } from "@/components/shared/grouped-list";
import { TokenHoldingRow } from "@/components/wallet/token-holding-row";
import { WalletPanelSkeleton } from "@/components/wallet/wallet-panel-skeleton";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/copy/phygital";
import { walletContentColumnClass, walletDesktopTitleClass } from "@/lib/layout";
import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";
import type { SendAssetRef } from "@/lib/wallet/send-asset-ref";
import {
  ALL_LIST_SEARCH_THRESHOLD,
  sortHoldings,
} from "@/lib/wallet/portfolio-preview";

export function TokensAllPanel({
  holdings,
  loading = false,
  onBack,
  onSelect,
}: {
  holdings: PaymentTokenHolding[];
  loading?: boolean;
  onBack: () => void;
  onSelect: (asset: SendAssetRef) => void;
}) {
  const sorted = useMemo(() => sortHoldings(holdings), [holdings]);
  const [query, setQuery] = useState("");
  const showSearch = sorted.length >= ALL_LIST_SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (h) =>
        h.symbol.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        h.mint.toLowerCase().includes(q)
    );
  }, [sorted, query]);

  return (
    <div className={walletContentColumnClass}>
      <NavBar
        desktopHidden
        align="start"
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.tokens}
      />
      <h1 className={walletDesktopTitleClass}>{copy.wallet.tokens}</h1>

      {loading && holdings.length === 0 ? (
        <WalletPanelSkeleton />
      ) : (
        <>
          {showSearch ? (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.wallet.searchTokens}
              className="mx-1"
              autoCapitalize="off"
              autoCorrect="off"
            />
          ) : null}

          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {copy.wallet.noMatchingTokens}
            </p>
          ) : (
            <GroupedList>
              {filtered.map((h) => (
                <TokenHoldingRow key={h.mint} holding={h} onSelect={onSelect} />
              ))}
            </GroupedList>
          )}
        </>
      )}
    </div>
  );
}
