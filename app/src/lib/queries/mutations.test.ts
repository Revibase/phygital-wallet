import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { PolicyDocument } from "phygital-verifier-sdk";

import { queryKeys } from "./index";
import {
  applyOptimisticPortfolioDelta,
  applyWalletPolicy,
  invalidatePhygitalToken,
  restorePortfolioSnapshot,
} from "./mutations";
import type { WalletPortfolio } from "@/lib/wallet/portfolio-types";

const base: PolicyDocument = {
  version: "2.0",
  programs: [{ programId: "11111111111111111111111111111111", allowAll: true }],
};

const portfolio: WalletPortfolio = {
  holdings: [
    {
      mint: "UsdcMint",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      balanceRaw: "1000000",
      balanceUi: "1",
      pricePerTokenUsd: 1,
      valueUsd: 1,
      tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      icon: null,
    },
  ],
  collectibles: [
    {
      mint: "NftMint",
      name: "Art",
      image: null,
      collectionName: null,
      interface: "V1_NFT",
      compressed: false,
      tokenProgram: null,
    },
  ],
};

describe("applyWalletPolicy", () => {
  it("replaces cached policy with stored document", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletPolicy.byToken("token");
    qc.setQueryData(key, { policy: base, status: "ok" as const });
    const nextDoc: PolicyDocument = {
      ...base,
      programs: [
        ...base.programs,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", allowAll: true },
      ],
    };
    applyWalletPolicy(qc, "token", { policy: nextDoc, status: "ok" });
    const next = qc.getQueryData<{ policy: PolicyDocument | null; status: string }>(
      key,
    );
    expect(next?.status).toBe("ok");
    expect(next?.policy?.programs).toHaveLength(2);
  });

  it("caches none when limits are turned off", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletPolicy.byToken("token");
    qc.setQueryData(key, { policy: base, status: "ok" as const });
    applyWalletPolicy(qc, "token", { policy: null, status: "none" });
    expect(qc.getQueryData(key)).toEqual({ policy: null, status: "none" });
  });
});

describe("invalidatePhygitalToken", () => {
  it("matches identifier-keyed cache by data.address", () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData(queryKeys.phygitalToken.byIdentifier("pk"), {
      address: "token-pda",
    });
    invalidatePhygitalToken(qc, "token-pda");
    const predicate = invalidate.mock.calls[0]?.[0]?.predicate;
    expect(predicate).toBeTypeOf("function");
    const identifierQuery = qc.getQueryCache().find({
      queryKey: queryKeys.phygitalToken.byIdentifier("pk"),
    });
    expect(identifierQuery && predicate?.(identifierQuery)).toBe(true);
  });
});

describe("applyOptimisticPortfolioDelta / restorePortfolioSnapshot", () => {
  it("decrements holding and restores prior snapshot", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletPortfolio.byOwner("wallet");
    qc.setQueryData(key, portfolio);

    const previous = applyOptimisticPortfolioDelta(qc, {
      owner: "wallet",
      mint: "UsdcMint",
      amountUi: "0.5",
      direction: "out",
    });

    expect(previous).toEqual(portfolio);
    expect(qc.getQueryData<WalletPortfolio>(key)?.holdings[0]?.balanceUi).toBe(
      "0.5",
    );

    restorePortfolioSnapshot(qc, "wallet", previous);
    expect(qc.getQueryData(key)).toEqual(portfolio);
  });

  it("removes collectible and restores it on rollback", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletPortfolio.byOwner("wallet");
    qc.setQueryData(key, portfolio);

    const previous = applyOptimisticPortfolioDelta(qc, {
      owner: "wallet",
      mint: "NftMint",
      amountUi: "1",
      direction: "out",
      removeCollectible: true,
    });

    expect(qc.getQueryData<WalletPortfolio>(key)?.collectibles).toHaveLength(0);
    restorePortfolioSnapshot(qc, "wallet", previous);
    expect(qc.getQueryData<WalletPortfolio>(key)?.collectibles).toHaveLength(1);
  });
});
