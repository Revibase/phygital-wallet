import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { PaymentsPolicyConfig } from "phygital-policy";

import { queryKeys } from "./index";
import {
  applyOptimisticFeeBalance,
  applyOptimisticPortfolioDelta,
  applyOptimisticRecoveryWallet,
  applyOptimisticTokenVerifier,
  applyOptimisticWalletActivity,
  applyWalletPolicy,
  invalidatePhygitalToken,
  patchOptimisticWalletActivity,
  restoreFeeBalanceSnapshot,
  restorePortfolioSnapshot,
  restoreRecoveryWalletSnapshot,
  restoreTokenVerifierSnapshot,
  restoreWalletActivitySnapshot,
} from "./mutations";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type {
  WalletActivityItem,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";

const base: PaymentsPolicyConfig = {
  version: "3",
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
    const nextDoc: PaymentsPolicyConfig = {
      ...base,
      mintLimits: [{ mint: "UsdcMint", maxRaw: "50000000" }],
    };
    applyWalletPolicy(qc, "token", { policy: nextDoc, status: "ok" });
    const next = qc.getQueryData<{ policy: PaymentsPolicyConfig | null; status: string }>(
      key,
    );
    expect(next?.status).toBe("ok");
    expect(next?.policy?.mintLimits).toEqual([
      { mint: "UsdcMint", maxRaw: "50000000" },
    ]);
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
      qc.getQueryData<{ items: WalletActivityItem[] }>(key)?.items[0]?.pending,
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
      qc.getQueryData<{ items: WalletActivityItem[] }>(key)?.items,
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

describe("applyOptimisticRecoveryWallet / restoreRecoveryWalletSnapshot", () => {
  it("patches and restores recovery wallet cache", () => {
    const qc = new QueryClient();
    const key = queryKeys.recoveryWallet.byToken("token");
    const previous = {
      configured: false,
      recoveryWallet: null,
      payer: null,
    };
    qc.setQueryData(key, previous);

    const next = {
      configured: true,
      recoveryWallet: "Recovery111111111111111111111111111111111",
      payer: null,
    };
    const snapshot = applyOptimisticRecoveryWallet(qc, "token", next);
    expect(snapshot).toEqual(previous);
    expect(qc.getQueryData(key)).toEqual(next);

    restoreRecoveryWalletSnapshot(qc, "token", snapshot);
    expect(qc.getQueryData(key)).toEqual(previous);
  });
});

describe("applyOptimisticTokenVerifier / restoreTokenVerifierSnapshot", () => {
  it("patches and restores token verifier cache", () => {
    const qc = new QueryClient();
    const key = queryKeys.tokenVerifier.byToken("token");
    const previous = {
      custom: false,
      verifier: null,
      endpoint: null,
      payer: null,
    };
    qc.setQueryData(key, previous);

    const next = {
      custom: true,
      verifier: "Verifier11111111111111111111111111111111",
      endpoint: "https://example.com",
      payer: null,
    };
    const snapshot = applyOptimisticTokenVerifier(qc, "token", next);
    expect(snapshot).toEqual(previous);
    expect(qc.getQueryData(key)).toEqual(next);

    restoreTokenVerifierSnapshot(qc, "token", snapshot);
    expect(qc.getQueryData(key)).toEqual(previous);
  });
});
