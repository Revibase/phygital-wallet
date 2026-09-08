"use client";

import { useEffect, useState } from "react";

import { ActivityList } from "@/components/wallet/activity-list";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { copy } from "@/lib/copy/phygital";
import { useWalletActivity } from "@/hooks/wallet/use-wallet-activity";
import type { WalletActivityItem } from "@/lib/wallet/portfolio-types";

export function ActivityAllSheet({
  walletAddress,
  onBack,
}: {
  walletAddress: string;
  onBack: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [pages, setPages] = useState<WalletActivityItem[]>([]);
  const activity = useWalletActivity(walletAddress, 40, cursor);

  useEffect(() => {
    setCursor(null);
    setPages([]);
  }, [walletAddress]);

  useEffect(() => {
    if (cursor != null && activity.isFetching) return;

    if (cursor == null) {
      setPages(activity.items);
      return;
    }

    if (activity.items.length === 0) return;

    setPages((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const item of activity.items) byId.set(item.id, item);
      return [...byId.values()].sort(
        (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
      );
    });
  }, [activity.items, activity.isFetching, cursor]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        align="start"
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.activity}
      />

      <ActivityList
        items={pages}
        emptyLabel={copy.wallet.noActivity}
        assetMetaByMint={activity.mintMeta}
        hasMore={Boolean(activity.nextCursor)}
        loadingMore={activity.isFetching && cursor != null}
        onLoadMore={
          activity.nextCursor
            ? () => setCursor(activity.nextCursor)
            : undefined
        }
      />
    </div>
  );
}
