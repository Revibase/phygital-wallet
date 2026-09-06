/**
 * STANDARD policy preset — wallet / collectible program allowlist.
 *
 * Prefer `defineStandardPolicy()` for the full document.
 * Spend caps (`maxMintRaw` / `maxSolLamports`) are **optional** — omit them
 * for a program allowlist without amount limits; pass explicit raws (or the
 * exported defaults) when enabling spend protection.
 */
import {
  ataParser,
  bubblegumParser,
  coreParser,
  systemParser,
  token2022Parser,
  tokenMetadataParser,
  tokenParser,
} from "../parsers/index.js";
import { definePolicy, defineProgram } from "../core/policy-builder.js";
import type {
  PolicyDocument,
  PolicyExpr,
  ProgramPolicy,
  TransactionConstraints,
} from "../core/types.js";

const DEFAULT_STANDARD_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const;

/** Suggested first-enable USDC raw cap (50 USDC at 6 decimals). */
export const DEFAULT_MAX_MINT_RAW = "50000000" as const;
/** Suggested first-enable SOL lamports cap (0.1 SOL). */
export const DEFAULT_MAX_SOL_LAMPORTS = "100000000" as const;

/**
 * Metaplex / compression companion programs used alongside collectible sends.
 * Included as `{ programId, allowAll: true }` when collectibles are enabled
 * (no STANDARD instruction parsers for these).
 */
export const COLLECTIBLE_COMPANION_PROGRAMS = [
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg",
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
] as const;

/** Convert UI amount to raw token units for policy authoring. */
export function uiAmountToRaw(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || !Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError("uiAmountToRaw: ui must be finite and decimals >= 0");
  }
  // Avoid float drift for common decimals by scaling via string when possible.
  const [whole, frac = ""] = String(ui).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const negative = whole.startsWith("-");
  const absWhole = negative ? whole.slice(1) : whole;
  const raw =
    BigInt(absWhole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -raw : raw;
}

function hasCap(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export type StandardPolicyOptions = {
  /** Mint for transferChecked eq condition. Default: mainnet USDC. */
  mint?: string;
  /**
   * Raw per-transaction cap for that mint (Token + Token-2022 combined).
   * Omit / `null` = no USDC amount cap. Pass {@link DEFAULT_MAX_MINT_RAW} for
   * the suggested first-enable value.
   */
  maxMintRaw?: string | null;
  /**
   * Lamports per-transaction cap for System transferSol.
   * Omit / `null` = no SOL amount cap. Pass {@link DEFAULT_MAX_SOL_LAMPORTS}
   * for the suggested first-enable value.
   */
  maxSolLamports?: string | null;
  /**
   * Wallet address for rent destination checks on closeAccount.
   * Required for closeAccount to be included when `includeTokenCloseAccount` is true.
   */
  wallet?: string;
  /**
   * Token Metadata Transfer, Bubblegum transfer/transferV2, Core TransferV1,
   * SPL transferChecked with amount ≤ 1, plus companion `allowAll` programs.
   * Default **true**.
   */
  includeCollectibles?: boolean;
  includeAta?: boolean;
  includeSystemSetup?: boolean;
  includeTokenCloseAccount?: boolean;
  /**
   * Allow SPL Token `transfer` with amount ≤ 1 (no mint binding).
   * Prefer `includeCollectibles` (uses transferChecked) for wallet NFT sends.
   */
  includeNftTokenTransfer?: boolean;
  /** Which SPL token program blocks to include. Default both. */
  tokenPrograms?: ReadonlyArray<"token" | "token2022">;
};

/**
 * Transaction-level caps for STANDARD policies (amount aggregates).
 * Returns `undefined` when neither spend cap is set.
 *
 * Compute Budget instructions are rejected by `createVerifier` itself (wallet
 * injects them at send time) — they are not part of STANDARD policy.
 */
export function standardTransaction(
  opts: StandardPolicyOptions = {},
): TransactionConstraints | undefined {
  const mint = opts.mint ?? DEFAULT_STANDARD_MINT;
  const maxMint = hasCap(opts.maxMintRaw) ? opts.maxMintRaw : null;
  const maxSol = hasCap(opts.maxSolLamports) ? opts.maxSolLamports : null;
  const tokenPrograms = opts.tokenPrograms ?? (["token", "token2022"] as const);

  const aggregates: TransactionConstraints["aggregates"] = [];

  if (maxMint) {
    const mintFields = [];
    if (tokenPrograms.includes("token")) {
      mintFields.push({
        programId: tokenParser.programId,
        instruction: "transferChecked",
        field: "amount",
        when: {
          field: "mint",
          type: "string" as const,
          op: "eq" as const,
          value: mint,
        },
      });
    }
    if (tokenPrograms.includes("token2022")) {
      mintFields.push({
        programId: token2022Parser.programId,
        instruction: "transferChecked",
        field: "amount",
        when: {
          field: "mint",
          type: "string" as const,
          op: "eq" as const,
          value: mint,
        },
      });
    }
    if (mintFields.length > 0) {
      aggregates.push({
        fields: mintFields,
        op: "lte" as const,
        value: maxMint,
      });
    }
  }

  if (maxSol) {
    aggregates.push({
      fields: [
        {
          programId: systemParser.programId,
          instruction: "transferSol",
          field: "amount",
        },
      ],
      op: "lte" as const,
      value: maxSol,
    });
  }

  if (aggregates.length === 0) return undefined;
  return { aggregates };
}

/**
 * Spread-friendly STANDARD policy program blocks.
 *
 * Instruction names match generated FIELD_SCHEMA exactly.
 * Optional spend caps via `maxMintRaw` / `maxSolLamports`; pair with
 * `standardTransaction` when caps are set (see `defineStandardPolicy`).
 */
export function standardPolicy(
  opts: StandardPolicyOptions = {},
): ProgramPolicy[] {
  const mint = opts.mint ?? DEFAULT_STANDARD_MINT;
  const maxMint = hasCap(opts.maxMintRaw) ? opts.maxMintRaw : null;
  const maxSol = hasCap(opts.maxSolLamports) ? opts.maxSolLamports : null;
  const includeCollectibles = opts.includeCollectibles ?? true;
  const includeAta = opts.includeAta ?? true;
  /** Off by default — createAccount/allocate/assign are powerful. */
  const includeSystemSetup = opts.includeSystemSetup ?? false;
  const includeTokenCloseAccount = opts.includeTokenCloseAccount ?? true;
  const includeNftTokenTransfer = opts.includeNftTokenTransfer ?? false;
  const tokenPrograms = opts.tokenPrograms ?? (["token", "token2022"] as const);
  const wallet = opts.wallet;

  const programs: ProgramPolicy[] = [];

  if (includeAta) {
    programs.push(
      defineProgram(ataParser, {
        allows: [
          { instruction: "create" },
          { instruction: "createIdempotent" },
        ],
      }),
    );
  }

  {
    const transferSolWhen: PolicyExpr | undefined = maxSol
      ? { field: "amount", type: "bigint", op: "lte", value: maxSol }
      : undefined;
    const allows: ProgramPolicy["allows"] = [
      transferSolWhen
        ? { instruction: "transferSol", when: transferSolWhen }
        : { instruction: "transferSol" },
    ];
    if (includeSystemSetup) {
      allows.push(
        { instruction: "createAccount" },
        { instruction: "allocate" },
        { instruction: "assign" },
      );
    }
    programs.push(defineProgram(systemParser, { allows }));
  }

  const tokenAllows = (): ProgramPolicy["allows"] => {
    // Collectibles transferChecked first so verify's lastPredFail prefers the
    // mint-bound USDC allow (recipient / spend_limit) when both paths fail.
    const allows: ProgramPolicy["allows"] = [];
    if (includeCollectibles) {
      allows.push({
        instruction: "transferChecked",
        when: { field: "amount", type: "bigint", op: "lte", value: "1" },
      });
    }
    if (maxMint) {
      allows.push({
        instruction: "transferChecked",
        when: {
          and: [
            { field: "mint", type: "string", op: "eq", value: mint },
            { field: "amount", type: "bigint", op: "lte", value: maxMint },
          ],
        },
      });
    } else {
      allows.push({
        instruction: "transferChecked",
        when: { field: "mint", type: "string", op: "eq", value: mint },
      });
    }
    if (includeNftTokenTransfer) {
      allows.push({
        instruction: "transfer",
        when: { field: "amount", type: "bigint", op: "lte", value: "1" },
      });
    }
    if (includeTokenCloseAccount && wallet) {
      allows.push({
        instruction: "closeAccount",
        when: {
          field: "destination",
          type: "string",
          op: "eq",
          value: wallet,
        },
      });
    }
    return allows;
  };

  if (tokenPrograms.includes("token")) {
    programs.push(defineProgram(tokenParser, { allows: tokenAllows() }));
  }
  if (tokenPrograms.includes("token2022")) {
    programs.push(defineProgram(token2022Parser, { allows: tokenAllows() }));
  }

  if (includeCollectibles) {
    programs.push(
      defineProgram(tokenMetadataParser, {
        allows: [
          {
            instruction: "Transfer",
            when: {
              field: "transferArgs.amount",
              type: "bigint",
              op: "lte",
              value: "1",
            },
          },
        ],
      }),
      defineProgram(bubblegumParser, {
        allows: [
          { instruction: "transfer" },
          { instruction: "transferV2" },
        ],
      }),
      defineProgram(coreParser, {
        allows: [{ instruction: "TransferV1" }],
      }),
    );
    for (const programId of COLLECTIBLE_COMPANION_PROGRAMS) {
      programs.push(defineProgram(programId, { allowAll: true }));
    }
  }

  return programs;
}

/**
 * Full STANDARD policy: program allows + optional per-tx aggregates.
 * Bare call = program allowlist without spend caps.
 */
export function defineStandardPolicy(
  opts: StandardPolicyOptions = {},
): PolicyDocument {
  return definePolicy(standardPolicy(opts), standardTransaction(opts));
}
