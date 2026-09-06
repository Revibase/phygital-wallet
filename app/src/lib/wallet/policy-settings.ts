/**
 * Owner policy settings ↔ SDK `PolicyDocument` (client-side).
 *
 * API stores/returns only `PolicyDocument`. The owner UI derives settings for
 * editing and compiles patches back into a full standing policy before PUT.
 */
import { address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  COLLECTIBLE_COMPANION_PROGRAMS,
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  RECIPIENT_ACCOUNT_FIELDS,
  ataParser,
  bubblegumParser,
  coreParser,
  defineStandardPolicy,
  indexProgramLayouts,
  isPolicyCondition,
  systemParser,
  token2022Parser,
  tokenMetadataParser,
  tokenParser,
  uiAmountToRaw,
  validatePolicy,
  type PolicyCondition,
  type PolicyDocument,
  type PolicyExpr,
  type ProgramPolicy,
} from "phygital-verifier-sdk";

import { getUsdcMint, USDC_DECIMALS } from "@/lib/tokens/usdc-mint";
import {
  CLASSIC_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
} from "@/lib/tokens/payment-token";

/** Owner-editable knobs on top of the fixed standing base. */
export type PolicySettings = {
  maxTransferUsdc: string | null;
  maxTransferSol: string | null;
  recipientMode: "anyone" | "allowlist";
  recipientAllowlist: string[];
  /**
   * Send protections master. When true, standing policy includes STANDARD
   * built-in programs (even with no caps / recipients / extras).
   */
  programAllowlist: boolean;
  /** Always true for owner-compiled policies. */
  includeStandardPrograms: boolean;
  /** Exception programs beyond the standard base — `{ allowAll: true }`. */
  extraPrograms: string[];
};

/** Empty settings when no standing policy is configured (opt-in). */
export const EMPTY_POLICY_SETTINGS: PolicySettings = {
  maxTransferUsdc: null,
  maxTransferSol: null,
  recipientMode: "anyone",
  recipientAllowlist: [],
  programAllowlist: false,
  includeStandardPrograms: true,
  extraPrograms: [],
};

function rawCapToUiAmount(raw: string, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n)) return String(n);
  return String(n);
}

/** Suggested caps when enabling spend limits for the first time. */
export const FIRST_ENABLE_POLICY_SETTINGS: PolicySettings = {
  ...EMPTY_POLICY_SETTINGS,
  maxTransferUsdc: rawCapToUiAmount(DEFAULT_MAX_MINT_RAW, USDC_DECIMALS),
  maxTransferSol: rawCapToUiAmount(DEFAULT_MAX_SOL_LAMPORTS, 9),
  programAllowlist: true,
  includeStandardPrograms: true,
};

/** Turn Send protections on — built-in surface only, no invented caps. */
export const PROTECTIONS_ON_SETTINGS: PolicySettings = {
  ...EMPTY_POLICY_SETTINGS,
  programAllowlist: true,
  includeStandardPrograms: true,
};

export function hasSpendCaps(settings: PolicySettings): boolean {
  return (
    (settings.maxTransferUsdc != null && settings.maxTransferUsdc !== "") ||
    (settings.maxTransferSol != null && settings.maxTransferSol !== "")
  );
}

/** True when settings warrant keeping a standing policy document. */
export function hasStandingPolicyContent(settings: PolicySettings): boolean {
  return (
    hasSpendCaps(settings) ||
    settings.recipientMode === "allowlist" ||
    settings.programAllowlist ||
    settings.extraPrograms.length > 0
  );
}

const BASE_PROGRAM_IDS = new Set<string>([
  ataParser.programId,
  systemParser.programId,
  tokenParser.programId,
  token2022Parser.programId,
  tokenMetadataParser.programId,
  bubblegumParser.programId,
  coreParser.programId,
  ...COLLECTIBLE_COMPANION_PROGRAMS,
]);

/** Sync hub/sheet summary from a stored document (no ATA collapse). */
export function summarizePolicyDocument(policy: PolicyDocument): {
  spendCaps: boolean;
  recipientAllowlist: boolean;
  unrestrictedApps: number;
} {
  return {
    spendCaps:
      findUsdcCapRaw(policy) != null || findSolCapLamports(policy) != null,
    recipientAllowlist: collectRecipientAllowValues(policy).length > 0,
    unrestrictedApps: policy.programs
      .map((p) => p.programId)
      .filter((id) => !BASE_PROGRAM_IDS.has(id)).length,
  };
}
/** Default program allowlist once a standing policy exists (human labels). */
export const STANDARD_ALLOWED_PROGRAMS: readonly {
  programId: string;
  label: string;
  /** Short blurb for the Programs detail sheet. */
  blurb: string;
}[] = [
  {
    programId: systemParser.programId,
    label: "System",
    blurb: "Native SOL transfers and basic account setup.",
  },
  {
    programId: tokenParser.programId,
    label: "Token",
    blurb: "Classic SPL token transfers (including USDC) and account closes.",
  },
  {
    programId: token2022Parser.programId,
    label: "Token-2022",
    blurb: "Token-2022 transfers for assets that use the newer token program.",
  },
  {
    programId: ataParser.programId,
    label: "Associated Token",
    blurb: "Creates the standard token accounts used when you send tokens.",
  },
  {
    programId: tokenMetadataParser.programId,
    label: "Token Metadata",
    blurb: "Transfers for Metaplex NFTs and pNFTs.",
  },
  {
    programId: bubblegumParser.programId,
    label: "Bubblegum",
    blurb: "Transfers for compressed NFTs (cNFTs).",
  },
  {
    programId: coreParser.programId,
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
const LAYOUTS_BY_PROGRAM = indexProgramLayouts();
const RECIPIENT_FIELDS = new Set<string>(RECIPIENT_ACCOUNT_FIELDS);

type RecipientSlot = {
  programId: string;
  instruction: string;
  field: string;
};

const RECIPIENT_SLOTS: readonly RecipientSlot[] = (() => {
  const slots: RecipientSlot[] = [];
  for (const [programId, byIx] of LAYOUTS_BY_PROGRAM) {
    for (const [instruction, layout] of byIx) {
      if (instruction === "closeAccount") continue;
      for (const name of RECIPIENT_ACCOUNT_FIELDS) {
        if (layout.fields[name]?.kind === "account") {
          slots.push({ programId, instruction, field: name });
          break;
        }
      }
    }
  }
  return slots;
})();

function* policyLeaves(
  expr: PolicyExpr | undefined,
): Generator<PolicyCondition> {
  if (!expr) return;
  if (isPolicyCondition(expr)) {
    yield expr;
    return;
  }
  if ("and" in expr) {
    for (const c of expr.and) yield* policyLeaves(c);
  } else if ("or" in expr) {
    for (const c of expr.or) yield* policyLeaves(c);
  } else if ("not" in expr) {
    yield* policyLeaves(expr.not);
  }
}

function andWhen(
  existing: PolicyExpr | undefined,
  cond: PolicyCondition,
): PolicyExpr {
  if (!existing) return cond;
  if ("and" in existing && Array.isArray(existing.and)) {
    return { and: [...existing.and, cond] };
  }
  return { and: [existing, cond] };
}

function uiCapToRaw(
  ui: string | null | undefined,
  decimals: number,
): string | undefined {
  if (ui == null || ui === "") return undefined;
  const n = Number(ui);
  if (!Number.isFinite(n)) return undefined;
  return uiAmountToRaw(n, decimals).toString();
}

function findUsdcCapRaw(policy: PolicyDocument): bigint | null {
  const usdc = String(getUsdcMint());
  const token = String(CLASSIC_TOKEN_PROGRAM);
  const token2022 = String(TOKEN_2022_PROGRAM);
  for (const agg of policy.transaction?.aggregates ?? []) {
    if (agg.op !== "lte" && agg.op !== "lt") continue;
    const matchesUsdc = agg.fields.some(
      (f) =>
        (f.programId === token || f.programId === token2022) &&
        f.instruction === "transferChecked" &&
        [...policyLeaves(f.when)].some(
          (c) => c.field === "mint" && c.op === "eq" && c.value === usdc,
        ),
    );
    if (matchesUsdc) return BigInt(agg.value);
  }
  return null;
}

function findSolCapLamports(policy: PolicyDocument): bigint | null {
  const system = String(SYSTEM_PROGRAM);
  for (const agg of policy.transaction?.aggregates ?? []) {
    if (agg.op !== "lte" && agg.op !== "lt") continue;
    const matchesSol = agg.fields.some(
      (f) => f.programId === system && f.instruction === "transferSol",
    );
    if (matchesSol) return BigInt(agg.value);
  }
  return null;
}

function collectRecipientAllowValues(policy: PolicyDocument): string[] {
  const out = new Set<string>();
  for (const block of policy.programs) {
    for (const rule of block.allows ?? []) {
      for (const c of policyLeaves(rule.when)) {
        if (!RECIPIENT_FIELDS.has(c.field) || c.op !== "in") continue;
        const values = Array.isArray(c.value) ? c.value : [c.value];
        for (const v of values) {
          if (typeof v === "string" && v) out.add(v);
        }
      }
    }
  }
  return [...out];
}

async function expandRecipientAddresses(
  wallets: readonly string[],
): Promise<string[]> {
  const set = new Set<string>(wallets);
  const mint = getUsdcMint();
  await Promise.all(
    wallets.map(async (ownerStr) => {
      try {
        const owner = address(ownerStr);
        const [[ata], [ata2022]] = await Promise.all([
          findAssociatedTokenPda({
            mint,
            owner,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }),
          findAssociatedTokenPda({
            mint,
            owner,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          }),
        ]);
        set.add(String(ata));
        set.add(String(ata2022));
      } catch {
        /* skip invalid addresses */
      }
    }),
  );
  return [...set];
}

async function collapseExpandedRecipients(
  expanded: readonly string[],
): Promise<string[]> {
  if (expanded.length === 0) return [];
  const set = new Set(expanded);
  const derivedAtas = new Set<string>();
  const mint = getUsdcMint();
  await Promise.all(
    expanded.map(async (ownerStr) => {
      try {
        const owner = address(ownerStr);
        const [[ata], [ata2022]] = await Promise.all([
          findAssociatedTokenPda({
            mint,
            owner,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }),
          findAssociatedTokenPda({
            mint,
            owner,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          }),
        ]);
        if (set.has(String(ata))) derivedAtas.add(String(ata));
        if (set.has(String(ata2022))) derivedAtas.add(String(ata2022));
      } catch {
        /* skip */
      }
    }),
  );
  return expanded.filter((a) => !derivedAtas.has(a));
}

function bakeRecipientConstraints(
  programs: readonly ProgramPolicy[],
  allowExpanded: readonly string[] | null,
): ProgramPolicy[] {
  if (!allowExpanded) {
    return programs.map((block) => {
      if (!block.denies?.length) return block;
      const next: ProgramPolicy = { programId: block.programId };
      if (block.allowAll) next.allowAll = true;
      if (block.allows?.length) next.allows = block.allows;
      return next;
    });
  }

  return programs.map((block) => {
    const slots = RECIPIENT_SLOTS.filter((s) => s.programId === block.programId);
    if (slots.length === 0) {
      if (!block.denies?.length) return block;
      const next: ProgramPolicy = { programId: block.programId };
      if (block.allowAll) next.allowAll = true;
      if (block.allows?.length) next.allows = block.allows;
      return next;
    }

    const slotByIx = new Map(slots.map((s) => [s.instruction, s.field]));
    const baseAllows = block.allows ?? [];
    let allows = baseAllows;
    let allowAll = block.allowAll === true;
    const list = [...allowExpanded];

    if (allowAll && baseAllows.length === 0) {
      allows = slots.map((s) => ({
        instruction: s.instruction,
        when: {
          field: s.field,
          type: "string" as const,
          op: "in" as const,
          value: list,
        },
      }));
      allowAll = false;
    } else {
      allows = baseAllows.map((a) => {
        const field = slotByIx.get(a.instruction);
        if (!field) return a;
        const cond: PolicyCondition = {
          field,
          type: "string",
          op: "in",
          value: list,
        };
        return { ...a, when: andWhen(a.when, cond) };
      });
    }

    const next: ProgramPolicy = { programId: block.programId };
    if (allowAll) next.allowAll = true;
    if (allows.length > 0) next.allows = allows;
    return next;
  });
}

function appendAllowAll(
  programs: readonly ProgramPolicy[],
  programIds: readonly string[],
): ProgramPolicy[] {
  const have = new Set(programs.map((p) => p.programId));
  const out = [...programs];
  for (const programId of programIds) {
    if (have.has(programId)) continue;
    out.push({ programId, allowAll: true });
    have.add(programId);
  }
  return out;
}

/** Read owner settings from a stored standing policy. */
export async function derivePolicySettings(
  policy: PolicyDocument,
): Promise<PolicySettings> {
  const usdcCap = findUsdcCapRaw(policy);
  const solCap = findSolCapLamports(policy);
  const allowExpanded = collectRecipientAllowValues(policy);
  const recipientAllowlist = await collapseExpandedRecipients(allowExpanded);

  return {
    maxTransferUsdc:
      usdcCap != null
        ? (Number(usdcCap) / 10 ** USDC_DECIMALS).toFixed(2)
        : null,
    maxTransferSol:
      solCap != null ? (Number(solCap) / 1e9).toFixed(4) : null,
    recipientMode: allowExpanded.length > 0 ? "allowlist" : "anyone",
    recipientAllowlist,
    programAllowlist: true,
    includeStandardPrograms: true,
    extraPrograms: policy.programs
      .map((p) => p.programId)
      .filter((id) => !BASE_PROGRAM_IDS.has(id)),
  };
}

/**
 * Build a standing `PolicyDocument` from owner settings.
 * Always includes the STANDARD built-in program set (+ optional extras).
 */
export async function compilePolicySettings(
  settings: PolicySettings,
  opts: { wallet?: string } = {},
): Promise<PolicyDocument> {
  const maxMintRaw = uiCapToRaw(settings.maxTransferUsdc, USDC_DECIMALS);
  const maxSolLamports = uiCapToRaw(settings.maxTransferSol, 9);
  const extras = settings.extraPrograms.filter(
    (id) => !BASE_PROGRAM_IDS.has(id),
  );

  const template = defineStandardPolicy({
    mint: String(getUsdcMint()),
    ...(opts.wallet ? { wallet: opts.wallet } : {}),
    ...(maxMintRaw ? { maxMintRaw } : {}),
    ...(maxSolLamports ? { maxSolLamports } : {}),
  });

  let programs = appendAllowAll(template.programs, extras);

  const allowExpanded =
    settings.recipientMode === "allowlist"
      ? await expandRecipientAddresses(settings.recipientAllowlist)
      : null;
  programs = bakeRecipientConstraints(programs, allowExpanded);

  const next: PolicyDocument = {
    version: "2.0",
    programs,
    ...(template.transaction ? { transaction: template.transaction } : {}),
  };

  const valid = validatePolicy(next);
  if (!valid.ok) {
    throw Object.assign(new Error(valid.message), {
      code: valid.code,
      details: valid.details,
    });
  }
  return next;
}

/** Merge a partial settings patch onto the current document, then compile. */
export async function applyPolicySettingsPatch(
  base: PolicyDocument,
  patch: Partial<PolicySettings>,
  opts: { wallet?: string } = {},
): Promise<PolicyDocument> {
  const current = await derivePolicySettings(base);
  return compilePolicySettings(
    {
      maxTransferUsdc:
        patch.maxTransferUsdc !== undefined
          ? patch.maxTransferUsdc
          : current.maxTransferUsdc,
      maxTransferSol:
        patch.maxTransferSol !== undefined
          ? patch.maxTransferSol
          : current.maxTransferSol,
      recipientMode: patch.recipientMode ?? current.recipientMode,
      recipientAllowlist:
        patch.recipientAllowlist !== undefined
          ? patch.recipientAllowlist
          : current.recipientAllowlist,
      programAllowlist: patch.programAllowlist ?? current.programAllowlist,
      includeStandardPrograms: true,
      extraPrograms:
        patch.extraPrograms !== undefined
          ? patch.extraPrograms
          : current.extraPrograms,
    },
    opts,
  );
}
