"use client";

import { memo } from "react";

import { GroupedRow } from "@/components/shared/grouped-list";
import { TokenIcon } from "@/components/shared/token-chip";
import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";
import { formatUsd } from "@/lib/currency/usd";
import { holdingToSendAsset, type SendAssetRef } from "@/lib/wallet/send-asset-ref";

/** Shared token row for home preview and See All. */
export const TokenHoldingRow = memo(function TokenHoldingRow({
  holding,
  onSelect,
  className,
}: {
  holding: PaymentTokenHolding;
  onSelect: (asset: SendAssetRef) => void;
  className?: string;
}) {
  return (
    <GroupedRow
      className={className}
      onClick={() => onSelect(holdingToSendAsset(holding))}
      leading={
        <TokenIcon
          token={{
            mint: holding.mint,
            symbol: holding.symbol,
            icon: holding.icon,
          }}
          className="size-8"
        />
      }
      trailing={
        <div className="shrink-0 text-right">
          <p className="text-sm tabular-nums">{holding.balanceUi}</p>
          {holding.valueUsd != null ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatUsd(holding.valueUsd)}
            </p>
          ) : null}
        </div>
      }
      subtitle={holding.name}
    >
      {holding.symbol}
    </GroupedRow>
  );
});
