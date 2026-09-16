/**
 * Post-mutation React Query cache updates.
 *
 * On-chain sends/receives/fee top-ups/config txs: patch on RPC accept, restore
 * if confirm fails (do not invalidate on land). Off-chain API mutations should
 * only `setQueryData` / invalidate after the request succeeds — never invent
 * pending rows before the server confirms.
 *
 * Prefer setQueryData when the client already knows the next value (e.g. policy
 * PUT response). Prefer invalidate when the shape is hard to patch safely.
 */

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { ProgramPermissionArgs } from "phygital-wallet-sdk";

import type { TokenAuthority } from "@/hooks/token/use-token-authority";
import type {
  ProgramAccessKind,
  ProgramPermissionView,
  SpendCapView,
  WalletPolicyView,
} from "@/hooks/token/use-wallet-policy";
import { formatTokenAmount, uiAmountToRaw } from "@/lib/tokens/amount";
import type { PaymentTokenHolding } from "@/lib/tokens/payment-token";
import type { FeeBalance } from "@/lib/wallet/fee-balance-client";
import type {
  WalletActivityItem,
  WalletPortfolio,
} from "@/lib/wallet/portfolio-types";
import {
  FEE_BALANCE_LOW_LAMPORTS,
  lamportsToSolUi,
} from "@/lib/wallet/network-fee";
import type {
  MintCapInput,
  SolCapInput,
} from "@/lib/wallet/set-wallet-policy";

import { queryKeys } from "./keys";

/** First-page sizes used by `useWalletActivity` (default) and ActivityAllPanel. */
const ACTIVITY_FIRST_PAGE_LIMITS = [20, 40] as const;

type WalletActivityPage = {
  items: WalletActivityItem[];
  nextCursor: string | null;
};

export type WalletActivitySnapshot = Array<{
  queryKey: QueryKey;
  previous: WalletActivityPage | undefined;
}>;

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function cachedTokenAddress(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("address" in data)) return null;
  const address = (data as { address: unknown }).address;
  return address == null ? null : String(address);
}

function adjustHolding(
  holding: PaymentTokenHolding,
  amountUi: string,
  direction: "in" | "out"
): PaymentTokenHolding {
  try {
    const delta = uiAmountToRaw(amountUi, holding.decimals);
    const current = BigInt(holding.balanceRaw);
    const nextRaw =
      direction === "out"
        ? current > delta
          ? current - delta
          : 0n
        : current + delta;
    const balanceUi = formatTokenAmount(nextRaw, holding.decimals);
    const valueUsd =
      holding.pricePerTokenUsd != null
        ? Number(balanceUi) * holding.pricePerTokenUsd
        : holding.valueUsd;
    return {
      ...holding,
      balanceRaw: nextRaw.toString(),
      balanceUi,
      valueUsd,
    };
  } catch {
    return holding;
  }
}

/**
 * Light optimistic portfolio patch. Returns the previous cache value so callers
 * can restorePortfolioSnapshot if the tx does not land.
 */
export function applyOptimisticPortfolioDelta(
  queryClient: QueryClient,
  args: {
    owner: string;
    mint: string;
    amountUi: string;
    direction: "in" | "out";
    /** Remove collectible from cache instead of adjusting a fungible holding. */
    removeCollectible?: boolean;
  }
): WalletPortfolio | undefined {
  const key = queryKeys.walletPortfolio.byOwner(args.owner);
  const previous = queryClient.getQueryData<WalletPortfolio>(key);
  queryClient.setQueryData<WalletPortfolio>(key, (prev) => {
    if (!prev) return prev;
    if (args.removeCollectible) {
      return {
        ...prev,
        collectibles: prev.collectibles.filter((c) => c.mint !== args.mint),
      };
    }
    return {
      ...prev,
      holdings: prev.holdings.map((h) =>
        h.mint === args.mint
          ? adjustHolding(h, args.amountUi, args.direction)
          : h
      ),
    };
  });
  return previous;
}

/** Undo applyOptimisticPortfolioDelta after a failed confirmation. */
export function restorePortfolioSnapshot(
  queryClient: QueryClient,
  owner: string,
  previous: WalletPortfolio | undefined
): void {
  const key = queryKeys.walletPortfolio.byOwner(owner);
  if (previous === undefined) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

const SOL_DECIMALS = 9;

/**
 * Credit or debit prepaid network fees. Returns the previous cache value so
 * callers can restoreFeeBalanceSnapshot if the tx does not land.
 */
export function applyOptimisticFeeBalance(
  queryClient: QueryClient,
  args: {
    token: string;
    amountUi: string;
    direction: "in" | "out";
  }
): FeeBalance | undefined {
  const key = queryKeys.feeBalance.byToken(args.token);
  const previous = queryClient.getQueryData<FeeBalance>(key);
  queryClient.setQueryData<FeeBalance>(key, (prev) => {
    try {
      const delta = Number(uiAmountToRaw(args.amountUi, SOL_DECIMALS));
      if (!Number.isFinite(delta) || delta <= 0) return prev;
      const current = prev?.balanceLamports ?? 0;
      const nextLamports =
        args.direction === "out"
          ? Math.max(0, current - delta)
          : current + delta;
      return {
        balanceLamports: nextLamports,
        balanceUi: lamportsToSolUi(nextLamports),
        low: nextLamports < FEE_BALANCE_LOW_LAMPORTS,
      };
    } catch {
      return prev;
    }
  });
  return previous;
}

/** Undo applyOptimisticFeeBalance after a failed confirmation. */
export function restoreFeeBalanceSnapshot(
  queryClient: QueryClient,
  token: string,
  previous: FeeBalance | undefined
): void {
  const key = queryKeys.feeBalance.byToken(token);
  if (previous === undefined) {
    void queryClient.invalidateQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

function isOwnerActivityFirstPage(
  queryKey: readonly unknown[],
  owner: string
): boolean {
  return (
    queryKey[0] === "walletActivity" &&
    queryKey[1] === owner &&
    queryKey[3] == null
  );
}

function prependActivityItem(
  page: WalletActivityPage | undefined,
  item: WalletActivityItem
): WalletActivityPage {
  return {
    items: [item, ...(page?.items ?? []).filter((row) => row.id !== item.id)],
    nextCursor: page?.nextCursor ?? null,
  };
}

/**
 * Insert a pending activity row into first-page caches (same lifecycle as
 * applyOptimisticPortfolioDelta). Returns snapshots for restore on failure.
 */
export function applyOptimisticWalletActivity(
  queryClient: QueryClient,
  item: WalletActivityItem
): WalletActivitySnapshot {
  const keys = new Map<string, QueryKey>();
  const addKey = (queryKey: QueryKey) => {
    keys.set(JSON.stringify(queryKey), queryKey);
  };

  for (const query of queryClient.getQueryCache().findAll({
    queryKey: queryKeys.walletActivity.all(),
  })) {
    if (isOwnerActivityFirstPage(query.queryKey, item.walletAddress)) {
      addKey(query.queryKey);
    }
  }
  for (const limit of ACTIVITY_FIRST_PAGE_LIMITS) {
    addKey(queryKeys.walletActivity.byOwner(item.walletAddress, limit, null));
  }

  const snapshot: WalletActivitySnapshot = [];
  for (const queryKey of keys.values()) {
    snapshot.push({
      queryKey,
      previous: queryClient.getQueryData<WalletActivityPage>(queryKey),
    });
    queryClient.setQueryData<WalletActivityPage>(queryKey, (prev) =>
      prependActivityItem(prev, item)
    );
  }
  return snapshot;
}

/** Mark an optimistic activity row confirmed (or failed) without a refetch. */
export function patchOptimisticWalletActivity(
  queryClient: QueryClient,
  args: {
    owner: string;
    id: string;
    patch: Partial<WalletActivityItem>;
  }
): void {
  queryClient.setQueriesData<WalletActivityPage>(
    {
      queryKey: queryKeys.walletActivity.all(),
      predicate: (query) =>
        isOwnerActivityFirstPage(query.queryKey, args.owner),
    },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === args.id ? { ...item, ...args.patch } : item
        ),
      };
    }
  );
}

/** Undo applyOptimisticWalletActivity after a failed confirmation. */
export function restoreWalletActivitySnapshot(
  queryClient: QueryClient,
  snapshot: WalletActivitySnapshot | undefined
): void {
  if (!snapshot) return;
  for (const { queryKey, previous } of snapshot) {
    if (previous === undefined) {
      queryClient.removeQueries({ queryKey });
      continue;
    }
    queryClient.setQueryData(queryKey, previous);
  }
}

/**
 * Portfolio + fee balance. Does **not** touch wallet activity (Helius history
 * is expensive; optimistic rows cover post-send UX).
 */
export function invalidateWalletBalances(
  queryClient: QueryClient,
  args: {
    wallets?: Array<string | null | undefined>;
    tokens?: Array<string | null | undefined>;
  }
): void {
  for (const owner of uniq(args.wallets ?? [])) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.walletPortfolio.byOwner(owner),
    });
  }
  for (const token of uniq(args.tokens ?? [])) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.feeBalance.byToken(token),
    });
  }
}

/** On-chain token account changed (signing settings, ownership, etc.). */
export function invalidatePhygitalToken(
  queryClient: QueryClient,
  tokenAddress?: string | null
): void {
  if (!tokenAddress) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.phygitalToken.all(),
    });
    return;
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.phygitalToken.all(),
    predicate: (query) => {
      const key = query.queryKey;
      if (key[1] === "address" && key[2] === tokenAddress) return true;
      return cachedTokenAddress(query.state.data) === tokenAddress;
    },
  });
}

/** Invalidate DAS / portfolio caches when the active RPC preference changes. */
export function invalidateRpcDependentQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.walletPortfolio.all(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.dasCollectible.all(),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.mintedCollectibleView.all(),
  });
}

/**
 * After RPC accept: keep the optimistic patch; on confirm failure, rollback.
 * Does not invalidate on successful land (callers already patched the next value).
 */
export function watchTransactionConfirmation(args: {
  confirmed: Promise<void>;
  rollback: () => void;
  onConfirmError?: (error: unknown) => void;
}): void {
  void args.confirmed.then(
    () => undefined,
    (error) => {
      args.rollback();
      args.onConfirmError?.(error);
    },
  );
}

/** Claim / standard empty set_wallet_policy: active policy, no caps/overrides. */
export const STANDARD_POLICY_VIEW: WalletPolicyView = {
  status: "standard",
  hasLimits: false,
  solCap: null,
  mintCaps: [],
  programPermissions: [],
};

/** clear_wallet_policy: authority kept, no accessory checks. */
export const OPEN_POLICY_VIEW: WalletPolicyView = {
  status: "open",
  hasLimits: false,
  solCap: null,
  mintCaps: [],
  programPermissions: [],
};

/** Unclaimed / after clear_authority. */
export const NONE_POLICY_VIEW: WalletPolicyView = {
  status: "none",
  hasLimits: false,
  solCap: null,
  mintCaps: [],
  programPermissions: [],
};

function programAccessKind(
  access: ProgramPermissionArgs["access"],
): ProgramAccessKind {
  switch (access.__kind) {
    case "AllInstructions":
      return "allow";
    case "Denied":
      return "deny";
    default:
      return "custom";
  }
}

function optimisticCapView(
  next: { cap: bigint; windowSeconds: bigint },
  previous: SpendCapView | null | undefined,
  nowSeconds: bigint,
): SpendCapView {
  if (
    previous &&
    previous.cap === next.cap &&
    previous.windowSeconds === next.windowSeconds
  ) {
    return previous;
  }
  return {
    cap: next.cap,
    remaining: next.cap,
    lastReset: nowSeconds,
    windowSeconds: next.windowSeconds,
  };
}

/**
 * Build the wallet-policy cache value for a successful `set_wallet_policy`.
 * Unchanged caps keep remaining/lastReset; changed caps refill + reanchor.
 */
export function buildOptimisticWalletPolicyView(
  input: {
    solCap?: SolCapInput | null;
    mintCaps?: MintCapInput[];
    programPermissions?: ProgramPermissionArgs[];
  },
  previous: WalletPolicyView | undefined,
  nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
): WalletPolicyView {
  const solInput = input.solCap ?? null;
  const mintInputs = input.mintCaps ?? [];
  const programInputs = input.programPermissions ?? [];

  const previousByMint = new Map(
    (previous?.mintCaps ?? []).map((m) => [m.mint, m]),
  );

  const solCap = solInput
    ? optimisticCapView(solInput, previous?.solCap, nowSeconds)
    : null;

  const mintCaps = mintInputs.map((m) => ({
    mint: m.mint,
    ...optimisticCapView(m, previousByMint.get(m.mint), nowSeconds),
  }));

  const programPermissions: ProgramPermissionView[] = programInputs.map(
    (p) => ({
      programId: String(p.programId),
      kind: programAccessKind(p.access),
      // Args and decoded access share the same discriminator shapes we display.
      access: p.access as ProgramPermissionView["access"],
    }),
  );

  const hasLimits =
    solCap != null || mintCaps.length > 0 || programPermissions.length > 0;

  return {
    status: hasLimits ? "limited" : "standard",
    hasLimits,
    solCap,
    mintCaps,
    programPermissions,
  };
}

export function applyOptimisticTokenAuthority(
  queryClient: QueryClient,
  token: string,
  next: TokenAuthority,
): TokenAuthority | undefined {
  const key = queryKeys.tokenAuthority.byToken(token);
  const previous = queryClient.getQueryData<TokenAuthority>(key);
  queryClient.setQueryData(key, next);
  return previous;
}

export function restoreTokenAuthoritySnapshot(
  queryClient: QueryClient,
  token: string,
  previous: TokenAuthority | undefined,
): void {
  const key = queryKeys.tokenAuthority.byToken(token);
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

export function applyOptimisticWalletPolicy(
  queryClient: QueryClient,
  token: string,
  next: WalletPolicyView,
): WalletPolicyView | undefined {
  const key = queryKeys.walletPolicy.byToken(token);
  const previous = queryClient.getQueryData<WalletPolicyView>(key);
  queryClient.setQueryData(key, next);
  return previous;
}

export function restoreWalletPolicySnapshot(
  queryClient: QueryClient,
  token: string,
  previous: WalletPolicyView | undefined,
): void {
  const key = queryKeys.walletPolicy.byToken(token);
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}

export function applyOptimisticOwnedAccessories(
  queryClient: QueryClient,
  authority: string | null | undefined,
  token: string,
  direction: "add" | "remove",
): string[] | undefined {
  if (!authority) return undefined;
  const key = queryKeys.ownedAccessories.byAuthority(authority);
  const previous = queryClient.getQueryData<string[]>(key);
  if (previous === undefined) {
    if (direction === "add") queryClient.setQueryData(key, [token]);
    return previous;
  }
  const next =
    direction === "add"
      ? previous.includes(token)
        ? previous
        : [...previous, token]
      : previous.filter((t) => t !== token);
  queryClient.setQueryData(key, next);
  return previous;
}

export function restoreOwnedAccessoriesSnapshot(
  queryClient: QueryClient,
  authority: string | null | undefined,
  previous: string[] | undefined,
): void {
  if (!authority) return;
  const key = queryKeys.ownedAccessories.byAuthority(authority);
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey: key });
    return;
  }
  queryClient.setQueryData(key, previous);
}
