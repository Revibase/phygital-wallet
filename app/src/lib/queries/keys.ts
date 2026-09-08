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
      [...queryKeys.walletActivity.all(), owner, limit, cursor ?? null] as const,
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

  walletPolicy: {
    all: () => ["walletPolicy"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.walletPolicy.all(), token] as const,
  },

  walletApprovals: {
    all: () => ["walletApprovals"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.walletApprovals.all(), token] as const,
  },

  deviceAuth: {
    all: () => ["deviceAuth"] as const,
    session: () => [...queryKeys.deviceAuth.all(), "session"] as const,
    links: () => [...queryKeys.deviceAuth.all(), "links"] as const,
    linkStatus: (token: string | null) =>
      [...queryKeys.deviceAuth.all(), "status", token] as const,
    claimed: (token: string | null) =>
      [...queryKeys.deviceAuth.all(), "claimed", token] as const,
    browseUnlock: (token: string | null) =>
      [...queryKeys.deviceAuth.all(), "browseUnlock", token] as const,
    /** Session + browse + link + claimed in one round-trip. */
    gate: (token: string | null) =>
      [...queryKeys.deviceAuth.all(), "gate", token] as const,
  },

  walletPda: {
    all: () => ["walletPda"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.walletPda.all(), token] as const,
  },

  recoveryWallet: {
    all: () => ["recoveryWallet"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.recoveryWallet.all(), token] as const,
  },

  tokenVerifier: {
    all: () => ["tokenVerifier"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.tokenVerifier.all(), token] as const,
  },

  resolvedVerifier: {
    all: () => ["resolvedVerifier"] as const,
    byToken: (token: string | null) =>
      [...queryKeys.resolvedVerifier.all(), token] as const,
  },

  phygitalToken: {
    all: () => ["phygitalTokens"] as const,
    byIdentifier: (identifier: string | null) =>
      [...queryKeys.phygitalToken.all(), "identifier", identifier] as const,
    byAddress: (token: string | null) =>
      [...queryKeys.phygitalToken.all(), "address", token] as const,
  },
};
