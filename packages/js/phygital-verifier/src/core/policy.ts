/**
 * Composable policy rules over Codama-parsed instructions.
 */
import type { Instruction } from "@solana/instructions";
import {
  addressString,
  type AddressLike,
  type InstructionMatcher,
  type ParsedProgramIx,
  type ProgramAdapter,
} from "./adapter.js";
import {
  fail,
  ok,
  type VerifyFailDetails,
  type VerifyResult,
} from "./types.js";

/** Custom soft/hard fail produced by a rule that matched but rejected. */
export type RuleFail = {
  code: string;
  message: string;
  details?: VerifyFailDetails;
};

/** Full transaction context for {@link RuleOnFail} (e.g. ATA→owner from sibling ixs). */
export type RuleFailContext = {
  instructions: readonly Instruction[];
  instructionIndex: number;
};

/**
 * When a matcher hits but `when` is false:
 * - return a {@link RuleFail} → fail verify with that code/details
 * - return null/undefined → try later allow rules
 */
export type RuleOnFail<TParsed extends ParsedProgramIx = ParsedProgramIx> = (
  parsed: TParsed,
  ctx: RuleFailContext,
) => RuleFail | null | undefined;

export type AllowOptions<TParsed extends ParsedProgramIx = ParsedProgramIx> = {
  when?: (parsed: TParsed) => boolean;
  onFail?: RuleOnFail<TParsed>;
};

export type AllowRule<TParsed extends ParsedProgramIx = ParsedProgramIx> = {
  readonly kind: "allow";
  readonly matcher: InstructionMatcher<TParsed>;
  readonly predicate?: (parsed: TParsed) => boolean;
  readonly onFail?: RuleOnFail<TParsed>;
};

export type DenyRule<TParsed extends ParsedProgramIx = ParsedProgramIx> = {
  readonly kind: "deny";
  readonly matcher: InstructionMatcher<TParsed>;
  readonly predicate?: (parsed: TParsed) => boolean;
};

export type AllowProgramRule = {
  readonly kind: "allowProgram";
  readonly programAddress: string;
};

export type DenyProgramRule = {
  readonly kind: "denyProgram";
  readonly programAddress: string;
};

export type AggregateSource<TParsed extends ParsedProgramIx = ParsedProgramIx> = {
  matcher: InstructionMatcher<TParsed>;
  /** Extract a bigint contribution from a matched instruction. */
  amount: (parsed: TParsed) => bigint;
  /** Optional filter; false excludes this ix from the sum. */
  when?: (parsed: TParsed) => boolean;
};

export type AggregateOpts = {
  lte?: bigint;
  lt?: bigint;
  gte?: bigint;
  gt?: bigint;
  eq?: bigint;
  /** Custom fail when the aggregate comparison fails. */
  onFail?: (ctx: {
    op: AggregateRule["op"];
    limit: bigint;
    actual: bigint;
    instructions: readonly Instruction[];
  }) => RuleFail | null | undefined;
};

export type AggregateRule = {
  readonly kind: "aggregate";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly sources: readonly AggregateSource<any>[];
  readonly op: "lte" | "lt" | "gte" | "gt" | "eq";
  readonly value: bigint;
  readonly onFail?: AggregateOpts["onFail"];
};

export type Rule =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | AllowRule<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | DenyRule<any>
  | AllowProgramRule
  | DenyProgramRule
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | AggregateRule;

export function allow<TParsed extends ParsedProgramIx>(
  matcher: InstructionMatcher<TParsed>,
  predicateOrOpts?: ((parsed: TParsed) => boolean) | AllowOptions<TParsed>,
): AllowRule<TParsed> {
  if (typeof predicateOrOpts === "function") {
    return { kind: "allow", matcher, predicate: predicateOrOpts };
  }
  return {
    kind: "allow",
    matcher,
    predicate: predicateOrOpts?.when,
    onFail: predicateOrOpts?.onFail,
  };
}

export function deny<TParsed extends ParsedProgramIx>(
  matcher: InstructionMatcher<TParsed>,
  predicate?: (parsed: TParsed) => boolean,
): DenyRule<TParsed> {
  return { kind: "deny", matcher, predicate };
}

export function allowProgram(programAddress: AddressLike): AllowProgramRule {
  return { kind: "allowProgram", programAddress: addressString(programAddress) };
}

export function denyProgram(programAddress: AddressLike): DenyProgramRule {
  return { kind: "denyProgram", programAddress: addressString(programAddress) };
}

export function aggregate<TParsed extends ParsedProgramIx>(
  sources: readonly AggregateSource<TParsed>[],
  opts: AggregateOpts,
): AggregateRule {
  const cmpKeys = ["lte", "lt", "gte", "gt", "eq"] as const;
  const entries = cmpKeys
    .filter((k) => opts[k] !== undefined)
    .map((k) => [k, opts[k]!] as [AggregateRule["op"], bigint]);
  if (entries.length !== 1) {
    throw new Error("aggregate: provide exactly one of lte|lt|gte|gt|eq");
  }
  const [op, value] = entries[0]!;
  return { kind: "aggregate", sources, op, value, onFail: opts.onFail };
}

export type Policy = {
  readonly rules: readonly Rule[];
  verify(instructions: readonly Instruction[]): VerifyResult;
};

function compare(op: AggregateRule["op"], actual: bigint, limit: bigint): boolean {
  switch (op) {
    case "lte":
      return actual <= limit;
    case "lt":
      return actual < limit;
    case "gte":
      return actual >= limit;
    case "gt":
      return actual > limit;
    case "eq":
      return actual === limit;
  }
}

function instructionNameOf(parsed: ParsedProgramIx | undefined): string | null {
  if (!parsed) return null;
  const t = parsed.instructionType;
  // String enums already carry the label; numeric TS enums stringify as the discriminant.
  return typeof t === "string" ? t : String(t);
}

/** Pull transfer-shaped fields off a Codama parse for soft-deny UX. */
function detailsFromParsed(
  base: VerifyFailDetails,
  parsed: ParsedProgramIx | undefined,
): VerifyFailDetails {
  const instructionName = instructionNameOf(parsed);
  if (!parsed) {
    return instructionName != null
      ? { ...base, instructionName }
      : { ...base, instructionName: null };
  }

  const out: VerifyFailDetails = { ...base, instructionName };
  const accounts = parsed.accounts;
  if (accounts && typeof accounts === "object") {
    const dest = (accounts as { destination?: { address?: unknown } })
      .destination?.address;
    if (dest != null) out.destination = String(dest);
    const mint = (accounts as { mint?: { address?: unknown } }).mint?.address;
    if (mint != null) out.mint = String(mint);
  }
  const data = parsed.data;
  if (data && typeof data === "object") {
    const amount = (data as { amount?: unknown }).amount;
    if (typeof amount === "bigint") out.amount = amount.toString();
    else if (typeof amount === "number" || typeof amount === "string") {
      out.amount = String(amount);
    }
    const decimals = (data as { decimals?: unknown }).decimals;
    if (typeof decimals === "number") out.decimals = decimals;
  }
  return out;
}

function failFromRule(
  base: VerifyFailDetails,
  parsed: ParsedProgramIx | undefined,
  custom: RuleFail,
): VerifyResult {
  return fail(custom.code, custom.message, {
    ...detailsFromParsed(base, parsed),
    ...custom.details,
  });
}

/**
 * Build a fail-closed policy. Every instruction must match an allow /
 * allowProgram rule; denies win; aggregates run after all ixs pass.
 */
export function policy(rules: readonly Rule[]): Policy {
  const allows = rules.filter((r): r is AllowRule => r.kind === "allow");
  const denies = rules.filter((r): r is DenyRule => r.kind === "deny");
  const allowPrograms = rules.filter(
    (r): r is AllowProgramRule => r.kind === "allowProgram",
  );
  const denyPrograms = rules.filter(
    (r): r is DenyProgramRule => r.kind === "denyProgram",
  );
  const aggregates = rules.filter((r): r is AggregateRule => r.kind === "aggregate");

  const allowedPrograms = new Set(allowPrograms.map((r) => r.programAddress));
  for (const r of allows) allowedPrograms.add(r.matcher.programAddress);
  for (const r of denies) allowedPrograms.add(r.matcher.programAddress);

  // Aggregate-only programs still need to be “known” for routing; they don't
  // by themselves allow an ix — allows must cover those instructions.

  const adapters = new Map<string, ProgramAdapter>();
  for (const r of [...allows, ...denies]) {
    adapters.set(r.matcher.programAddress, r.matcher.adapter);
  }
  for (const agg of aggregates) {
    for (const src of agg.sources) {
      adapters.set(src.matcher.programAddress, src.matcher.adapter);
    }
  }

  function verify(instructions: readonly Instruction[]): VerifyResult {
    if (allows.length === 0 && allowPrograms.length === 0) {
      return fail(
        "invalid_policy",
        "Policy has no allow / allowProgram rules",
      );
    }

    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i]!;
      const programId = addressString(ix.programAddress);
      const details: VerifyFailDetails = { instructionIndex: i, programId };

      if (denyPrograms.some((r) => r.programAddress === programId)) {
        return fail(
          "instruction_denied",
          `Program denied: ${programId}`,
          details,
        );
      }

      if (!allowedPrograms.has(programId) && !adapters.has(programId)) {
        return fail(
          "program_not_allowed",
          `Program not allowed: ${programId}`,
          details,
        );
      }

      for (const rule of denies) {
        if (rule.matcher.programAddress !== programId) continue;
        const parsed = rule.matcher.tryMatch(ix);
        if (!parsed) continue;
        const hit = rule.predicate ? rule.predicate(parsed) : true;
        if (hit) {
          return fail(
            "instruction_denied",
            `Instruction denied: ${instructionNameOf(parsed)}`,
            detailsFromParsed(details, parsed),
          );
        }
      }

      let allowed = false;

      if (allowPrograms.some((r) => r.programAddress === programId)) {
        // allowProgram: any instruction for this program (denies already applied)
        allowed = true;
      }

      if (!allowed) {
        for (const rule of allows) {
          if (rule.matcher.programAddress !== programId) continue;
          const parsed = rule.matcher.tryMatch(ix);
          if (!parsed) continue;
          const hit = rule.predicate ? rule.predicate(parsed) : true;
          if (hit) {
            allowed = true;
            break;
          }
          // Matched but rejected — optional owned error, else try later allows.
          if (rule.onFail) {
            const custom = rule.onFail(parsed, {
              instructions,
              instructionIndex: i,
            });
            if (custom) return failFromRule(details, parsed, custom);
          }
        }
      }

      if (!allowed) {
        // Try parse for amount / destination / name on soft-deny UX paths.
        const adapter = adapters.get(programId);
        const parsed = adapter?.tryParse(ix);
        return fail(
          "instruction_not_allowed",
          parsed
            ? `Instruction not allowed: ${instructionNameOf(parsed)}`
            : `Instruction not allowed for program ${programId}`,
          detailsFromParsed(details, parsed),
        );
      }
    }

    for (const agg of aggregates) {
      let sum = 0n;
      for (const ix of instructions) {
        for (const src of agg.sources) {
          if (addressString(ix.programAddress) !== src.matcher.programAddress) {
            continue;
          }
          const parsed = src.matcher.tryMatch(ix);
          if (!parsed) continue;
          if (src.when && !src.when(parsed)) continue;
          try {
            sum += src.amount(parsed);
          } catch (e) {
            return fail(
              "aggregate_failed",
              e instanceof Error ? e.message : "Failed to read aggregate amount",
              { programId: src.matcher.programAddress },
            );
          }
        }
      }
      if (!compare(agg.op, sum, agg.value)) {
        if (agg.onFail) {
          const custom = agg.onFail({
            op: agg.op,
            limit: agg.value,
            actual: sum,
            instructions,
          });
          if (custom) {
            return fail(custom.code, custom.message, {
              op: agg.op,
              limit: agg.value.toString(),
              actual: sum.toString(),
              ...custom.details,
            });
          }
        }
        return fail(
          "aggregate_limit",
          `Aggregate ${agg.op} ${agg.value.toString()} failed (actual ${sum.toString()})`,
          {
            op: agg.op,
            limit: agg.value.toString(),
            actual: sum.toString(),
          },
        );
      }
    }

    return ok();
  }

  return { rules, verify };
}
