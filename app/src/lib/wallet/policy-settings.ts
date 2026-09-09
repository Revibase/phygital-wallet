/**
 * Owner policy settings ↔ PaymentsPolicyConfig (client-side).
 */
import {
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  uiAmountToRaw,
  validatePaymentsPolicyConfig,
  type PaymentsPolicyConfig,
} from "phygital-policy";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  CLASSIC_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
} from "@/lib/tokens/payment-token";
import { getUsdcMint, USDC_DECIMALS } from "@/lib/tokens/usdc-mint";

/** Built-in Metaplex / compression programs (not in @solana-program/*). */
const TOKEN_METADATA_PROGRAM =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const BUBBLEGUM_PROGRAM = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
const MPL_CORE_PROGRAM = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const COLLECTIBLE_COMPANION_PROGRAMS = [
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg",
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
] as const;
/** One fungible mint spend cap in UI units. */
export type MintSpendCapSetting = {
  mint: string;
  /** Human amount (not raw). */
  maxUi: string;
  decimals: number;
  /** Display label when known (e.g. USDC). */
  symbol?: string;
};

/** Optional decimals/symbol hints when deriving from a stored policy. */
export type MintCapMeta = {
  decimals: number;
  symbol?: string;
};

/** Owner-editable knobs (maps onto PaymentsPolicyConfig fields). */
export type PolicySettings = {
  mintLimits: MintSpendCapSetting[];
  maxTransferSol: string | null;
  /** True when send protections should stay on (standing policy present). */
  programAllowlist: boolean;
  extraPrograms: string[];
};

export const EMPTY_POLICY_SETTINGS: PolicySettings = {
  mintLimits: [],
  maxTransferSol: null,
  programAllowlist: false,
  extraPrograms: [],
};

function rawCapToUiAmount(raw: string, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n)) return String(n);
  return String(n);
}

export function defaultUsdcMintCap(): MintSpendCapSetting {
  return {
    mint: String(getUsdcMint()),
    maxUi: rawCapToUiAmount(DEFAULT_MAX_MINT_RAW, USDC_DECIMALS),
    decimals: USDC_DECIMALS,
    symbol: "USDC",
  };
}

export const FIRST_ENABLE_POLICY_SETTINGS: PolicySettings = {
  ...EMPTY_POLICY_SETTINGS,
  mintLimits: [defaultUsdcMintCap()],
  maxTransferSol: rawCapToUiAmount(DEFAULT_MAX_SOL_LAMPORTS, 9),
  programAllowlist: true,
};

export const PROTECTIONS_ON_SETTINGS: PolicySettings = {
  ...EMPTY_POLICY_SETTINGS,
  programAllowlist: true,
};

export function hasMintSpendCaps(settings: PolicySettings): boolean {
  return settings.mintLimits.some(
    (l) => l.maxUi != null && String(l.maxUi).trim() !== "",
  );
}

export function hasSpendCaps(settings: PolicySettings): boolean {
  return (
    hasMintSpendCaps(settings) ||
    (settings.maxTransferSol != null && settings.maxTransferSol !== "")
  );
}

export function shouldPersistPolicy(settings: PolicySettings): boolean {
  return (
    settings.programAllowlist ||
    hasSpendCaps(settings) ||
    settings.extraPrograms.length > 0
  );
}

/** True when settings warrant keeping a standing policy document. */
export function hasStandingPolicyContent(settings: PolicySettings): boolean {
  return (
    hasSpendCaps(settings) ||
    settings.programAllowlist ||
    settings.extraPrograms.length > 0
  );
}

function uiCapToRaw(ui: string | null, decimals: number): string | null {
  if (ui == null || ui === "") return null;
  const n = Number(ui);
  if (!Number.isFinite(n) || n < 0) return null;
  return uiAmountToRaw(n, decimals).toString();
}

/** Resolve decimals for a mint when rehydrating from policy JSON. */
export function resolveMintDecimals(
  mint: string,
  meta?: ReadonlyMap<string, MintCapMeta>,
): number {
  const hint = meta?.get(mint);
  if (hint && Number.isInteger(hint.decimals) && hint.decimals >= 0) {
    return hint.decimals;
  }
  if (mint === String(getUsdcMint())) return USDC_DECIMALS;
  return 6;
}

export function resolveMintSymbol(
  mint: string,
  meta?: ReadonlyMap<string, MintCapMeta>,
): string | undefined {
  const hint = meta?.get(mint)?.symbol?.trim();
  if (hint) return hint;
  if (mint === String(getUsdcMint())) return "USDC";
  return undefined;
}

const BASE_PROGRAM_IDS = new Set<string>([
  String(SYSTEM_PROGRAM),
  String(CLASSIC_TOKEN_PROGRAM),
  String(TOKEN_2022_PROGRAM),
  String(ASSOCIATED_TOKEN_PROGRAM),
  TOKEN_METADATA_PROGRAM,
  BUBBLEGUM_PROGRAM,
  MPL_CORE_PROGRAM,
  ...COLLECTIBLE_COMPANION_PROGRAMS,
]);

/** Built-in programs shown in the Exceptions sheet (informational). */
export const STANDARD_ALLOWED_PROGRAMS: readonly {
  programId: string;
  label: string;
  blurb: string;
}[] = [
  {
    programId: String(SYSTEM_PROGRAM),
    label: "System",
    blurb: "Native SOL transfers and basic account setup.",
  },
  {
    programId: String(CLASSIC_TOKEN_PROGRAM),
    label: "Token",
    blurb: "Classic SPL token transfers (including USDC).",
  },
  {
    programId: String(TOKEN_2022_PROGRAM),
    label: "Token-2022",
    blurb: "Token-2022 transfers for assets that use the newer token program.",
  },
  {
    programId: String(ASSOCIATED_TOKEN_PROGRAM),
    label: "Associated Token",
    blurb: "Creates the standard token accounts used when you send tokens.",
  },
  {
    programId: TOKEN_METADATA_PROGRAM,
    label: "Token Metadata",
    blurb: "Transfers for Metaplex NFTs and pNFTs.",
  },
  {
    programId: BUBBLEGUM_PROGRAM,
    label: "Bubblegum",
    blurb: "Transfers for compressed NFTs (cNFTs).",
  },
  {
    programId: MPL_CORE_PROGRAM,
    label: "Core",
    blurb: "Transfers for Metaplex Core digital assets.",
  },
  {
    programId: COLLECTIBLE_COMPANION_PROGRAMS[0],
    label: "Token Auth Rules",
    blurb: "Authorization rules used with some programmable NFTs.",
  },
  {
    programId: COLLECTIBLE_COMPANION_PROGRAMS[1],
    label: "Account Compression",
    blurb: "Merkle tree helpers used by compressed NFT transfers.",
  },
  {
    programId: COLLECTIBLE_COMPANION_PROGRAMS[2],
    label: "SPL Noop",
    blurb: "Logging helper used alongside compressed NFT transfers.",
  },
];

export function isStandardAllowedProgram(programId: string): boolean {
  return BASE_PROGRAM_IDS.has(programId);
}

export function summarizePolicyDocument(policy: PaymentsPolicyConfig): {
  spendCaps: boolean;
  unrestrictedApps: number;
} {
  return {
    spendCaps: Boolean(
      (policy.mintLimits && policy.mintLimits.length > 0) ||
        policy.maxSolLamports,
    ),
    unrestrictedApps: (policy.extraPrograms ?? []).filter(
      (id) => !BASE_PROGRAM_IDS.has(id),
    ).length,
  };
}

export async function derivePolicySettings(
  policy: PaymentsPolicyConfig | null,
  mintMeta?: ReadonlyMap<string, MintCapMeta>,
): Promise<PolicySettings> {
  if (!policy) return { ...EMPTY_POLICY_SETTINGS };
  const mintLimits: MintSpendCapSetting[] = (policy.mintLimits ?? []).map(
    (l) => {
      const decimals = resolveMintDecimals(l.mint, mintMeta);
      return {
        mint: l.mint,
        maxUi: rawCapToUiAmount(l.maxRaw, decimals),
        decimals,
        symbol: resolveMintSymbol(l.mint, mintMeta),
      };
    },
  );
  return {
    mintLimits,
    maxTransferSol: policy.maxSolLamports
      ? rawCapToUiAmount(policy.maxSolLamports, 9)
      : null,
    programAllowlist: true,
    extraPrograms: (policy.extraPrograms ?? []).filter(
      (id) => !BASE_PROGRAM_IDS.has(id),
    ),
  };
}

export async function compilePolicySettings(
  settings: PolicySettings,
): Promise<PaymentsPolicyConfig> {
  const mintLimits = [];
  for (const cap of settings.mintLimits) {
    const mint = cap.mint.trim();
    if (!mint) continue;
    const maxRaw = uiCapToRaw(cap.maxUi, cap.decimals);
    if (!maxRaw) continue;
    mintLimits.push({ mint, maxRaw });
  }
  const maxSolLamports = uiCapToRaw(settings.maxTransferSol, 9);
  const extras = settings.extraPrograms.filter(
    (id) => !BASE_PROGRAM_IDS.has(id),
  );

  const config: PaymentsPolicyConfig = {
    version: "3",
    ...(mintLimits.length > 0 ? { mintLimits } : {}),
    ...(maxSolLamports ? { maxSolLamports } : {}),
    ...(extras.length > 0 ? { extraPrograms: extras } : {}),
  };

  const valid = validatePaymentsPolicyConfig(config);
  if (!valid.ok) {
    throw Object.assign(new Error(valid.message), { code: valid.code });
  }
  return valid.config;
}

export async function applyPolicySettingsPatch(
  base: PaymentsPolicyConfig,
  patch: Partial<PolicySettings>,
  mintMeta?: ReadonlyMap<string, MintCapMeta>,
): Promise<PaymentsPolicyConfig> {
  const current = await derivePolicySettings(base, mintMeta);
  return compilePolicySettings({
    mintLimits:
      patch.mintLimits !== undefined ? patch.mintLimits : current.mintLimits,
    maxTransferSol:
      patch.maxTransferSol !== undefined
        ? patch.maxTransferSol
        : current.maxTransferSol,
    programAllowlist: patch.programAllowlist ?? current.programAllowlist,
    extraPrograms:
      patch.extraPrograms !== undefined
        ? patch.extraPrograms
        : current.extraPrograms,
  });
}
