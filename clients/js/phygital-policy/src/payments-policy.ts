/**
 * Revibase payments / collectibles policy — Codama adapters + verifier rules.
 *
 * Config knobs match the app: spend caps + exception programs.
 * Built-in wallet/collectible surface is fixed (always on when a policy exists).
 */
import {
  aggregate,
  allow,
  allowProgram,
  denyProgram,
  policy,
  type InstructionMatcher,
  type ParsedProgramIx,
  type Policy,
  type Rule,
} from "phygital-verifier-sdk";
import {
  associatedToken,
  bubblegum,
  mplCore,
  system,
  token,
  token2022,
  tokenMetadata,
  AssociatedTokenAccountInstruction,
  BubblegumInstruction,
  MplCoreProgramInstruction,
  SystemInstruction,
  TokenInstruction,
  Token2022Instruction,
  TokenMetadataInstruction,
} from "./adapters.js";
import { formatUiAmount, isUsdcMint, SOL_DECIMALS } from "./amount-format.js";
import { walletOwnerForAta } from "./ata-owner.js";

const COMPUTE_BUDGET_PROGRAM_ADDRESS =
  "ComputeBudget111111111111111111111111111111" as const;

export const DEFAULT_MAX_MINT_RAW = "50000000" as const;
export const DEFAULT_MAX_SOL_LAMPORTS = "100000000" as const;

const COLLECTIBLE_COMPANION_PROGRAMS = [
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg",
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
] as const;

/** Per-mint fungible spend cap (raw token units). */
export type MintSpendLimit = {
  mint: string;
  maxRaw: string;
};

/**
 * Standing policy document — only what the app configures.
 * Built-in programs / collectibles are always allowed when this document exists.
 */
export type PaymentsPolicyConfig = {
  version: "3";
  /** Fungible spend caps keyed by mint. Absent/empty → no fungible mint caps. */
  mintLimits?: readonly MintSpendLimit[];
  /** SOL spend cap in lamports. Absent → uncapped SOL. */
  maxSolLamports?: string;
  /** Extra programs allowed without spend-cap checks. */
  extraPrograms?: readonly string[];
};

type TransferCheckedIx = ParsedProgramIx & {
  accounts: {
    mint: { address: string };
    destination: { address: string };
  };
  data: { amount: bigint; decimals: number };
};

type TransferIx = ParsedProgramIx & {
  data: { amount: bigint };
};

type TransferSolIx = ParsedProgramIx & {
  accounts: { destination: { address: string } };
  data: { amount: bigint };
};

function hasCap(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseMintLimits(
  limits: readonly MintSpendLimit[] | null | undefined,
): Map<string, bigint> {
  const map = new Map<string, bigint>();
  if (!limits) return map;
  for (const entry of limits) {
    if (!entry || typeof entry !== "object") continue;
    const mint = typeof entry.mint === "string" ? entry.mint.trim() : "";
    if (!mint || !hasCap(entry.maxRaw)) continue;
    try {
      map.set(mint, BigInt(entry.maxRaw));
    } catch {
      // skip invalid raw amounts
    }
  }
  return map;
}

export function uiAmountToRaw(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || !Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError("uiAmountToRaw: ui must be finite and decimals >= 0");
  }
  const [whole, frac = ""] = String(ui).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const negative = whole.startsWith("-");
  const absWhole = negative ? whole.slice(1) : whole;
  const raw =
    BigInt(absWhole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -raw : raw;
}

function isMintSpendLimit(value: unknown): value is MintSpendLimit {
  if (value == null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.mint === "string" && typeof o.maxRaw === "string";
}

/**
 * Validate knobs JSON into a clean PaymentsPolicyConfig.
 */
export function validatePaymentsPolicyConfig(
  raw: unknown,
):
  | { ok: true; config: PaymentsPolicyConfig }
  | { ok: false; code: string; message: string } {
  if (raw == null || typeof raw !== "object") {
    return {
      ok: false,
      code: "invalid_policy",
      message: "Policy config must be an object",
    };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== "3") {
    return {
      ok: false,
      code: "invalid_policy",
      message: `Unsupported policy version: ${String(obj.version)}`,
    };
  }

  let mintLimits: MintSpendLimit[] | undefined;
  if (obj.mintLimits !== undefined) {
    if (!Array.isArray(obj.mintLimits)) {
      return {
        ok: false,
        code: "invalid_policy",
        message: "mintLimits must be an array",
      };
    }
    mintLimits = [];
    for (const entry of obj.mintLimits) {
      if (!isMintSpendLimit(entry)) {
        return {
          ok: false,
          code: "invalid_policy",
          message: "mintLimits entries must be { mint, maxRaw } strings",
        };
      }
      mintLimits.push({ mint: entry.mint.trim(), maxRaw: entry.maxRaw });
    }
  }

  const config: PaymentsPolicyConfig = {
    version: "3",
    ...(mintLimits && mintLimits.length > 0 ? { mintLimits } : {}),
    ...(typeof obj.maxSolLamports === "string" && obj.maxSolLamports.length > 0
      ? { maxSolLamports: obj.maxSolLamports }
      : {}),
    ...(Array.isArray(obj.extraPrograms)
      ? {
          extraPrograms: obj.extraPrograms.filter(
            (v): v is string => typeof v === "string",
          ),
        }
      : {}),
  };

  return { ok: true, config };
}

function pushTokenProgramRules(
  rules: Rule[],
  opts: {
    transferChecked: InstructionMatcher<TransferCheckedIx>;
    transfer: InstructionMatcher<TransferIx>;
    mintLimits: Map<string, bigint>;
  },
) {
  const { transferChecked, transfer, mintLimits } = opts;

  // Dust / NFT unit transfers — no owned error when amount > 1 (fall through).
  rules.push(allow(transferChecked, (ix) => ix.data.amount <= 1n));

  if (mintLimits.size > 0) {
    rules.push(
      allow(transferChecked, {
        when: (ix) => {
          const limit = mintLimits.get(String(ix.accounts.mint.address));
          if (limit == null) return false;
          return ix.data.amount <= limit;
        },
        onFail: (ix, { instructions }) => {
          const mint = String(ix.accounts.mint.address);
          const limit = mintLimits.get(mint);
          if (limit == null) return undefined;
          const decimals = ix.data.decimals;
          const symbol = isUsdcMint(mint) ? "USDC" : undefined;
          const ata = String(ix.accounts.destination.address);
          const destination =
            walletOwnerForAta(instructions, ata, mint) ?? ata;
          return {
            code: "spend_limit",
            message: "This send is over your spending limit.",
            details: {
              instructionName: "TransferChecked",
              amount: ix.data.amount.toString(),
              decimals,
              amountUi: formatUiAmount(ix.data.amount, decimals),
              destination,
              mint,
              limit: limit.toString(),
              limitUi: formatUiAmount(limit, decimals),
              ...(symbol ? { symbol } : {}),
            },
          };
        },
      }),
    );
    for (const [mint, maxRaw] of mintLimits) {
      rules.push(
        aggregate(
          [
            {
              matcher: transferChecked,
              amount: (ix) => ix.data.amount,
              when: (ix) => String(ix.accounts.mint.address) === mint,
            },
          ],
          {
            lte: maxRaw,
            onFail: ({ limit, actual }) => ({
              code: "spend_limit",
              message: "This send is over your spending limit.",
              details: {
                mint,
                limit: limit.toString(),
                actual: actual.toString(),
                ...(isUsdcMint(mint) ? { symbol: "USDC" } : {}),
              },
            }),
          },
        ),
      );
    }
  }

  rules.push(allow(transfer, (ix) => ix.data.amount <= 1n));
}

/**
 * Build a fail-closed payments/collectibles policy from knobs.
 * Standing-surface flags use fixed defaults; only spend caps and extraPrograms
 * come from PaymentsPolicyConfig.
 *
 * Spend caps declare their soft-deny via `onFail` (code `spend_limit` + details).
 */
export function buildPaymentsPolicy(
  opts: PaymentsPolicyConfig = { version: "3" },
): Policy {
  const mintLimits = parseMintLimits(opts.mintLimits);
  const maxSol = hasCap(opts.maxSolLamports)
    ? BigInt(opts.maxSolLamports)
    : null;

  const rules: Rule[] = [denyProgram(COMPUTE_BUDGET_PROGRAM_ADDRESS)];

  rules.push(
    allow(
      associatedToken.instruction(AssociatedTokenAccountInstruction.Create),
    ),
    allow(
      associatedToken.instruction(
        AssociatedTokenAccountInstruction.CreateIdempotent,
      ),
    ),
  );

  const transferSol = system.instruction(
    SystemInstruction.TransferSol,
  ) as InstructionMatcher<TransferSolIx>;
  rules.push(
    maxSol != null
      ? allow(transferSol, {
          when: (ix) => ix.data.amount <= maxSol,
          onFail: (ix) => ({
            code: "spend_limit",
            message: "This send is over your SOL spending limit.",
            details: {
              instructionName: "TransferSol",
              amount: ix.data.amount.toString(),
              decimals: SOL_DECIMALS,
              amountUi: formatUiAmount(ix.data.amount, SOL_DECIMALS),
              destination: String(ix.accounts.destination.address),
              symbol: "SOL",
              limit: maxSol.toString(),
            },
          }),
        })
      : allow(transferSol),
  );
  rules.push(
    allow(system.instruction(SystemInstruction.CreateAccount)),
    allow(system.instruction(SystemInstruction.Allocate)),
    allow(system.instruction(SystemInstruction.Assign)),
  );

  pushTokenProgramRules(rules, {
    transferChecked: token.instruction(TokenInstruction.TransferChecked),
    transfer: token.instruction(TokenInstruction.Transfer),
    mintLimits,
  });

  pushTokenProgramRules(rules, {
    transferChecked: token2022.instruction(
      Token2022Instruction.TransferChecked,
    ),
    transfer: token2022.instruction(Token2022Instruction.Transfer),
    mintLimits,
  });

  rules.push(
    allow(
      tokenMetadata.instruction(TokenMetadataInstruction.Transfer),
      (ix) => ix.data.transferArgs.amount <= 1n,
    ),
    allow(bubblegum.instruction(BubblegumInstruction.Transfer)),
    allow(bubblegum.instruction(BubblegumInstruction.TransferV2)),
    allow(mplCore.instruction(MplCoreProgramInstruction.TransferV1)),
  );
  for (const programId of COLLECTIBLE_COMPANION_PROGRAMS) {
    rules.push(allowProgram(programId));
  }

  for (const programId of opts.extraPrograms ?? []) {
    rules.push(allowProgram(programId));
  }

  if (maxSol != null) {
    rules.push(
      aggregate(
        [
          {
            matcher: transferSol,
            amount: (ix) => ix.data.amount,
          },
        ],
        {
          lte: maxSol,
          onFail: ({ limit, actual }) => ({
            code: "spend_limit",
            message: "This send is over your SOL spending limit.",
            details: {
              symbol: "SOL",
              limit: limit.toString(),
              actual: actual.toString(),
            },
          }),
        },
      ),
    );
  }

  return policy(rules);
}
