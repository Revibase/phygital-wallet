import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "./index";
import {
  applyOptimisticFeeBalance,
  applyOptimisticOwnedAccessories,
  applyOptimisticPortfolioDelta,
  applyOptimisticTokenAuthority,
  applyOptimisticWalletActivity,
  applyOptimisticWalletPolicy,
  buildOptimisticWalletPolicyView,
  invalidatePhygitalToken,
  NONE_POLICY_VIEW,
  OPEN_POLICY_VIEW,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restoreOwnedAccessoriesSnapshot,
  restorePortfolioSnapshot,
  restoreTokenAuthoritySnapshot,
  restoreWalletActivitySnapshot,
  restoreWalletPolicySnapshot,
  STANDARD_POLICY_VIEW,
  watchTransactionConfirmation,
} from "./mutations";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type {
  WalletActivityItem,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";
import type { WalletPolicyView } from "@/hooks/token/use-wallet-policy";

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
      "0.5"
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

const pendingSend: WalletActivityItem = {
  id: "sig-1",
  walletAddress: "wallet",
  kind: "sent",
  title: "Sent USDC",
  subtitle: "Recipient",
  amountLabel: "-1",
  statusLabel: null,
  timestamp: 1_700_000_000,
  signature: "sig-1",
  mint: "UsdcMint",
  pending: true,
  source: "local",
};

describe("applyOptimisticWalletActivity / restoreWalletActivitySnapshot", () => {
  it("prepends a pending row and restores the prior first page", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletActivity.byOwner("wallet", 40, null);
    const existing: WalletActivityItem = {
      ...pendingSend,
      id: "sig-0",
      signature: "sig-0",
      pending: false,
      source: "helius",
    };
    qc.setQueryData(key, { items: [existing], nextCursor: "cursor" });

    const snapshot = applyOptimisticWalletActivity(qc, pendingSend);
    const page = qc.getQueryData<{ items: WalletActivityItem[] }>(key);
    expect(page?.items[0]?.id).toBe("sig-1");
    expect(page?.items[1]?.id).toBe("sig-0");

    patchOptimisticWalletActivity(qc, {
      owner: "wallet",
      id: "sig-1",
      patch: { pending: false },
    });
    expect(
      qc.getQueryData<{ items: WalletActivityItem[] }>(key)?.items[0]?.pending
    ).toBe(false);

    restoreWalletActivitySnapshot(qc, snapshot);
    expect(qc.getQueryData(key)).toEqual({
      items: [existing],
      nextCursor: "cursor",
    });
  });

  it("removes a seeded first page when there was no prior cache", () => {
    const qc = new QueryClient();
    const key = queryKeys.walletActivity.byOwner("wallet", 40, null);
    const snapshot = applyOptimisticWalletActivity(qc, pendingSend);
    expect(
      qc.getQueryData<{ items: WalletActivityItem[] }>(key)?.items
    ).toHaveLength(1);

    restoreWalletActivitySnapshot(qc, snapshot);
    expect(qc.getQueryData(key)).toBeUndefined();
  });
});

describe("applyOptimisticFeeBalance / restoreFeeBalanceSnapshot", () => {
  it("credits lamports and restores the prior snapshot", () => {
    const qc = new QueryClient();
    const key = queryKeys.feeBalance.byToken("token");
    const previous: FeeBalance = {
      balanceLamports: 500_000,
      balanceUi: "0.0005",
      low: true,
    };
    qc.setQueryData(key, previous);

    const snapshot = applyOptimisticFeeBalance(qc, {
      token: "token",
      amountUi: "0.01",
      direction: "in",
    });

    expect(snapshot).toEqual(previous);
    const next = qc.getQueryData<FeeBalance>(key);
    expect(next?.balanceLamports).toBe(10_500_000);
    expect(next?.low).toBe(false);

    restoreFeeBalanceSnapshot(qc, "token", snapshot);
    expect(qc.getQueryData(key)).toEqual(previous);
  });
});

describe("buildOptimisticWalletPolicyView", () => {
  it("keeps remaining for unchanged caps and refills changed ones", () => {
    const previous: WalletPolicyView = {
      status: "limited",
      hasLimits: true,
      solCap: {
        cap: 1_000_000_000n,
        remaining: 400_000_000n,
        lastReset: 100n,
        windowSeconds: 604_800n,
      },
      mintCaps: [
        {
          mint: "UsdcMint",
          cap: 5_000_000n,
          remaining: 1_000_000n,
          lastReset: 50n,
          windowSeconds: 0n,
        },
      ],
      programPermissions: [],
    };

    const next = buildOptimisticWalletPolicyView(
      {
        solCap: { cap: 1_000_000_000n, windowSeconds: 604_800n },
        mintCaps: [
          { mint: "UsdcMint", cap: 10_000_000n, windowSeconds: 0n },
        ],
        programPermissions: [],
      },
      previous,
      999n,
    );

    expect(next.solCap).toEqual(previous.solCap);
    expect(next.mintCaps[0]).toMatchObject({
      mint: "UsdcMint",
      cap: 10_000_000n,
      remaining: 10_000_000n,
      lastReset: 999n,
    });
    expect(next.status).toBe("limited");
  });

  it("maps empty set_wallet_policy to standard", () => {
    const next = buildOptimisticWalletPolicyView(
      { solCap: null, mintCaps: [], programPermissions: [] },
      undefined,
    );
    expect(next).toEqual(STANDARD_POLICY_VIEW);
  });
});

describe("claim / unlink optimistic cache helpers", () => {
  it("patches and restores authority, policy, and owned accessories", () => {
    const qc = new QueryClient();
    const token = "token-pda";
    const owner = "owner";

    qc.setQueryData(queryKeys.tokenAuthority.byToken(token), {
      isClaimed: false,
      authority: null,
    });
    qc.setQueryData(queryKeys.walletPolicy.byToken(token), NONE_POLICY_VIEW);
    qc.setQueryData(queryKeys.ownedAccessories.byAuthority(owner), []);

    const authorityBefore = applyOptimisticTokenAuthority(qc, token, {
      isClaimed: true,
      authority: owner,
    });
    const policyBefore = applyOptimisticWalletPolicy(
      qc,
      token,
      STANDARD_POLICY_VIEW,
    );
    const ownedBefore = applyOptimisticOwnedAccessories(
      qc,
      owner,
      token,
      "add",
    );

    expect(qc.getQueryData(queryKeys.tokenAuthority.byToken(token))).toEqual({
      isClaimed: true,
      authority: owner,
    });
    expect(qc.getQueryData(queryKeys.walletPolicy.byToken(token))).toEqual(
      STANDARD_POLICY_VIEW,
    );
    expect(qc.getQueryData(queryKeys.ownedAccessories.byAuthority(owner))).toEqual([
      token,
    ]);

    restoreTokenAuthoritySnapshot(qc, token, authorityBefore);
    restoreWalletPolicySnapshot(qc, token, policyBefore);
    restoreOwnedAccessoriesSnapshot(qc, owner, ownedBefore);

    expect(qc.getQueryData(queryKeys.tokenAuthority.byToken(token))).toEqual({
      isClaimed: false,
      authority: null,
    });
    expect(qc.getQueryData(queryKeys.walletPolicy.byToken(token))).toEqual(
      NONE_POLICY_VIEW,
    );
    expect(qc.getQueryData(queryKeys.ownedAccessories.byAuthority(owner))).toEqual(
      [],
    );
  });

  it("rolls back on watchTransactionConfirmation failure", async () => {
    const qc = new QueryClient();
    const token = "token-pda";
    const before = applyOptimisticWalletPolicy(qc, token, OPEN_POLICY_VIEW);

    watchTransactionConfirmation({
      confirmed: Promise.reject(new Error("expired")),
      rollback: () => restoreWalletPolicySnapshot(qc, token, before),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(qc.getQueryData(queryKeys.walletPolicy.byToken(token))).toBeUndefined();
  });
});
