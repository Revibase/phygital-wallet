/**
 * Codama-backed payments / collectibles policy builder.
 * Prefer importing config helpers from `payments-policy-config` (or package root)
 * when you only need validate / types — this module pulls generated clients.
 */
import { isAdvanceNonceAccountInstruction } from "@solana/kit";
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
  SYSTEM_PROGRAM_ADDRESS,
  SystemInstruction,
  TokenInstruction,
  Token2022Instruction,
  TokenMetadataInstruction,
} from "./adapters.js";
import { formatUiAmount, isUsdcMint, SOL_DECIMALS } from "./amount-format.js";
import { walletOwnerForAta } from "./ata-owner.js";
import type {
  MintSpendLimit,
  PaymentsPolicyConfig,
} from "./payments-policy-config.js";

const COMPUTE_BUDGET_PROGRAM_ADDRESS =
  "ComputeBudget111111111111111111111111111111" as const;

/** Kit-only: Codama system IDL does not include AdvanceNonceAccount. */
type AdvanceNonceParsed = ParsedProgramIx & {
  instructionType: "AdvanceNonceAccount";
};

function parseAdvanceNonce(
  ix: Parameters<InstructionMatcher["tryMatch"]>[0]
): AdvanceNonceParsed | undefined {
  if (!isAdvanceNonceAccountInstruction(ix)) return undefined;
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    instructionType: "AdvanceNonceAccount",
  };
}

const advanceNonceAccount: InstructionMatcher<AdvanceNonceParsed> = {
  kind: "instruction",
  programAddress: SYSTEM_PROGRAM_ADDRESS,
  instructionType: "AdvanceNonceAccount",
  adapter: {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    tryParse: parseAdvanceNonce,
  },
  tryMatch: parseAdvanceNonce,
};

const COLLECTIBLE_COMPANION_PROGRAMS = [
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg",
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
] as const;

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
  limits: readonly MintSpendLimit[] | null | undefined
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

function pushTokenProgramRules(
  rules: Rule[],
  opts: {
    transferChecked: InstructionMatcher<TransferCheckedIx>;
    transfer: InstructionMatcher<TransferIx>;
    mintLimits: Map<string, bigint>;
  }
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
          const destination = walletOwnerForAta(instructions, ata, mint) ?? ata;
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
      })
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
          }
        )
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
  opts: PaymentsPolicyConfig = { version: "3" }
): Policy {
  const mintLimits = parseMintLimits(opts.mintLimits);
  const maxSol = hasCap(opts.maxSolLamports)
    ? BigInt(opts.maxSolLamports)
    : null;

  const rules: Rule[] = [denyProgram(COMPUTE_BUDGET_PROGRAM_ADDRESS)];

  rules.push(
    allow(
      associatedToken.instruction(AssociatedTokenAccountInstruction.Create)
    ),
    allow(
      associatedToken.instruction(
        AssociatedTokenAccountInstruction.CreateIdempotent
      )
    )
  );

  const transferSol = system.instruction(
    SystemInstruction.TransferSol
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
      : allow(transferSol)
  );
  rules.push(
    allow(advanceNonceAccount),
    allow(system.instruction(SystemInstruction.CreateAccount)),
    allow(system.instruction(SystemInstruction.Allocate)),
    allow(system.instruction(SystemInstruction.Assign))
  );

  pushTokenProgramRules(rules, {
    transferChecked: token.instruction(TokenInstruction.TransferChecked),
    transfer: token.instruction(TokenInstruction.Transfer),
    mintLimits,
  });

  pushTokenProgramRules(rules, {
    transferChecked: token2022.instruction(
      Token2022Instruction.TransferChecked
    ),
    transfer: token2022.instruction(Token2022Instruction.Transfer),
    mintLimits,
  });

  rules.push(
    allow(
      tokenMetadata.instruction(TokenMetadataInstruction.Transfer),
      (ix) => ix.data.transferArgs.amount <= 1n
    ),
    allow(bubblegum.instruction(BubblegumInstruction.Transfer)),
    allow(bubblegum.instruction(BubblegumInstruction.TransferV2)),
    allow(mplCore.instruction(MplCoreProgramInstruction.TransferV1))
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
        }
      )
    );
  }

  return policy(rules);
}
