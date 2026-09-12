import { describe, expect, it } from "vitest";

import {
  CLASSIC_TOKEN_PROGRAM,
  NATIVE_SOL_MINT,
  NATIVE_SOL_TOKEN_PROGRAM,
} from "@/lib/tokens/payment-token";
import {
  HOME_COLLECTIBLE_PREVIEW,
  HOME_TOKEN_PREVIEW,
  previewCollectibles,
  previewHoldings,
  sortCollectibles,
  sortHoldings,
} from "@/lib/wallet/portfolio-preview";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";

function holding(
  mint: string,
  symbol: string,
  balanceUi: string,
  tokenProgram: string = String(CLASSIC_TOKEN_PROGRAM)
) {
  return {
    mint,
    symbol,
    name: symbol,
    icon: null,
    decimals: 6,
    tokenProgram,
    balanceRaw: balanceUi,
    balanceUi,
  };
}

describe("sortHoldings", () => {
  it("orders SOL then others by balance", () => {
    const sorted = sortHoldings([
      holding("mint-b", "BONK", "100"),
      holding(NATIVE_SOL_MINT, "SOL", "2", NATIVE_SOL_TOKEN_PROGRAM),
      holding("usdc-mint", "USDC", "50"),
      holding("mint-a", "AAA", "200"),
    ]);
    expect(sorted.map((h) => h.symbol)).toEqual(["SOL", "AAA", "BONK", "USDC"]);
  });
});

describe("previewHoldings", () => {
  it("caps at HOME_TOKEN_PREVIEW", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      holding(`mint-${i}`, `T${i}`, String(i))
    );
    expect(previewHoldings(many)).toHaveLength(HOME_TOKEN_PREVIEW);
  });
});

describe("sortCollectibles / previewCollectibles", () => {
  const items: WalletCollectible[] = [
    {
      mint: "b",
      name: "Beta",
      image: null,
      collectionName: null,
      interface: "V1_NFT",
      compressed: false,
      tokenProgram: null,
    },
    {
      mint: "linked",
      name: "Linked",
      image: null,
      collectionName: null,
      interface: "V1_NFT",
      compressed: false,
      tokenProgram: null,
    },
    {
      mint: "a",
      name: "Alpha",
      image: null,
      collectionName: null,
      interface: "V1_NFT",
      compressed: false,
      tokenProgram: null,
    },
  ];

  it("puts linked mint first", () => {
    expect(sortCollectibles(items, "linked")[0]?.mint).toBe("linked");
  });

  it("caps preview", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...items[0]!,
      mint: `m${i}`,
      name: `N${i}`,
    }));
    expect(previewCollectibles(many)).toHaveLength(HOME_COLLECTIBLE_PREVIEW);
  });
});
