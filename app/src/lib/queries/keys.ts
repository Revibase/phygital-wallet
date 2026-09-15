/** React Query key factories. Keep in sync with `persist.ts` root names. */

export const queryKeys = {
  dasCollectible: {
    all: () => ["dasCollectible"] as const,
    byMint: (mint: string | null) =>
      [...queryKeys.dasCollectible.all(), mint] as const,
  },

  mintedCollectibleView: {
    all: () => ["mintedCollectibleView"] as const,
    byMint: (mint: string | null) =>
      [...queryKeys.mintedCollectibleView.all(), mint] as const,
  },

  tapVerify: {
    all: () => ["tapVerify"] as const,
    byParams: (params: string) =>
      [...queryKeys.tapVerify.all(), params] as const,
  },

  walletPortfolio: {
    all: () => ["walletPortfolio"] as const,
    byOwner: (owner: string | null) =>
      [...queryKeys.walletPortfolio.all(), owner] as const,
  },

  walletActivity: {
    all: () => ["walletActivity"] as const,
    byOwner: (owner: string | null, limit = 20, cursor?: string | null) =>
      [
        ...queryKeys.walletActivity.all(),
        owner,
        limit,
        cursor ?? null,
      ] as const,
  },

  activityMintMeta: {
    all: () => ["activityMintMeta"] as const,
    byMint: (mint: string) =>
      [...queryKeys.activityMintMeta.all(), "mint", mint] as const,
    byMints: (mints: string[]) =>
      [...queryKeys.activityMintMeta.all(), "batch", mints.join(",")] as const,
  },

  feeBalance: {
    all: () => ["feeBalance"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.feeBalance.all(), token] as const,
  },

  verifiedTokens: {
    all: () => ["verifiedTokens"] as const,
  },



  browseUnlock: {
    all: () => ["browseUnlock"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.browseUnlock.all(), token] as const,
  },

  walletPda: {
    all: () => ["walletPda"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.walletPda.all(), token] as const,
  },

  tokenAuthority: {
    all: () => ["tokenAuthority"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.tokenAuthority.all(), token] as const,
  },

  ownedAccessories: {
    all: () => ["ownedAccessories"] as const,
    byOwner: (owner: string | null) =>
      [...queryKeys.ownedAccessories.all(), owner] as const,
  },

  walletPolicy: {
    all: () => ["walletPolicy"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.walletPolicy.all(), token] as const,
  },

  phygitalToken: {
    all: () => ["phygitalTokens"] as const,
    byIdentifier: (identifier: string | null) =>
      [...queryKeys.phygitalToken.all(), "identifier", identifier] as const,
    byAddress: (token: string | null) =>
      [...queryKeys.phygitalToken.all(), "address", token] as const,
  },
};
