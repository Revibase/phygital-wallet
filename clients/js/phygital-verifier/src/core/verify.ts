/**
 * Policy verification engine — compiled byte path only.
 *
 * `createVerifier({ parsers })` → `(policy, instructions) => VerifyResult`
 * Compiles each PolicyDocument internally (cached by object identity / JSON).
 */
import type {
  PolicyDocument,
  ProgramParser,
  Instruction,
  VerifyFail,
  VerifyFailDetails,
  VerifyResult,
  ParsedIx,
} from "./types.js";
import {
  collectLayoutsFromParsers,
  compilePolicy,
  compareInt,
  discEqBytes,
  evalParsedPredicates,
  evalPredicateGroups,
  identifyByDiscEntries,
  ixData,
  makeEvalCtx,
  readDataInt,
  type CompiledPolicy,
  type CompiledProgram,
  type CompiledRule,
  type CompileResult,
} from "./compile-policy.js";
import { indexProgramLayouts } from "../parsers/layouts.js";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  RECIPIENT_ACCOUNT_FIELDS,
} from "./constants.js";

export type CreateVerifierOptions = {
  parsers: readonly ProgramParser[];
};

const JSON_CACHE_MAX = 64;

function fail(
  code: string,
  message: string,
  details?: VerifyFailDetails,
): VerifyFail {
  return { ok: false, code, message, details };
}

function failAt(
  instructionIndex: number,
  code: string,
  message: string,
  details?: VerifyFailDetails,
): VerifyFail {
  return fail(code, message, { ...details, instructionIndex });
}

/** Account fields treated as send recipients (owner before ATA). */
const RECIPIENT_FIELD_NAMES = RECIPIENT_ACCOUNT_FIELDS;

function parsedString(parsed: ParsedIx, name: string): string | undefined {
  const v = parsed.fields[name];
  if (!v || v.type !== "string" || !v.value) return undefined;
  return String(v.value);
}

function parsedAmount(parsed: ParsedIx): string | undefined {
  for (const name of ["amount", "transferArgs.amount"] as const) {
    const v = parsed.fields[name];
    if (!v) continue;
    if (v.type === "bigint" || v.type === "number") return String(v.value);
    if (v.type === "string" && /^-?\d+$/.test(String(v.value))) {
      return String(v.value);
    }
  }
  return undefined;
}

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

function parsedDecimals(parsed: ParsedIx): number | undefined {
  const v = parsed.fields["decimals"];
  if (v?.type === "number" && Number.isFinite(v.value)) {
    return Number(v.value);
  }
  // Native SOL only — System transfers have no mint decimals field.
  if (
    parsed.programId === SYSTEM_PROGRAM &&
    (parsed.instructionName === "transfer" ||
      parsed.instructionName === "transferWithSeed")
  ) {
    return 9;
  }
  return undefined;
}

/** Format raw integer amount string with token decimals (no float drift). */
export function rawAmountToUi(raw: string, decimals: number): string | undefined {
  if (!/^-?\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0) {
    return undefined;
  }
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  try {
    const abs = BigInt(digits);
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = (abs % base)
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");
    const formatted = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
    return negative ? `-${formatted}` : formatted;
  } catch {
    return undefined;
  }
}

/** Flat UX fields from a parsed instruction (mint / amount / destination). */
function ixContextDetails(parsed: ParsedIx): VerifyFailDetails {
  let destination: string | undefined;
  for (const name of RECIPIENT_FIELD_NAMES) {
    const d = parsedString(parsed, name);
    if (d) {
      destination = d;
      break;
    }
  }
  const mint = parsedString(parsed, "mint");
  const amount = parsedAmount(parsed);
  const decimals = parsedDecimals(parsed);
  const amountUi =
    amount != null && decimals != null
      ? rawAmountToUi(amount, decimals)
      : undefined;
  return {
    programId: parsed.programId,
    instructionName: parsed.instructionName,
    ...(mint != null ? { mint } : {}),
    ...(amount != null ? { amount } : {}),
    ...(decimals != null ? { decimals } : {}),
    ...(amountUi != null ? { amountUi } : {}),
    ...(destination != null ? { destination } : {}),
  };
}

function failAtParsed(
  instructionIndex: number,
  code: string,
  message: string,
  details: VerifyFailDetails | undefined,
  parser: ProgramParser | undefined,
  parsedCache: (ParsedIx | undefined)[],
  ix: Instruction,
): VerifyFail {
  let ctx: VerifyFailDetails = {};
  if (parser) {
    const parsed = ensureParsed(parser, ix, parsedCache, instructionIndex);
    if (parsed.instructionName !== "Unknown") {
      ctx = ixContextDetails(parsed);
    } else {
      ctx = { programId: String(ix.programAddress) };
    }
  } else {
    ctx = { programId: String(ix.programAddress) };
  }
  return failAt(instructionIndex, code, message, { ...ctx, ...details });
}

/**
 * Shape / compile check for policy editors. Uses STANDARD layouts only;
 * prefer `createVerifier` + verify for full parser-backed compile.
 */
export function validatePolicy(policy: PolicyDocument): VerifyResult {
  const compiled = compilePolicy(policy, {
    layoutsByProgram: indexProgramLayouts(),
  });
  return compiled.ok ? { ok: true } : compiled;
}

function indexParsers(
  parsers: readonly ProgramParser[],
): { ok: true; parsers: Map<string, ProgramParser> } | VerifyFail {
  const map = new Map<string, ProgramParser>();
  for (const p of parsers) {
    if (map.has(p.programId)) {
      return fail(
        "invalid_parsers",
        `Duplicate parser for programId: ${p.programId}.`,
        { programId: p.programId },
      );
    }
    map.set(p.programId, p);
  }
  return { ok: true, parsers: map };
}

function identifyIx(
  data: Uint8Array,
  prog: CompiledProgram,
  parser: ProgramParser | undefined,
  parsedCache: (ParsedIx | undefined)[],
  i: number,
  ix: Instruction,
): string | null {
  const byDisc = identifyByDiscEntries(data, prog.discEntries);
  if (byDisc) return byDisc;

  if (!parser) return null;
  let parsed = parsedCache[i];
  if (!parsed) {
    parsed = parser.parse(ix);
    parsedCache[i] = parsed;
  }
  return parsed.instructionName === "Unknown" ? null : parsed.instructionName;
}

function ensureParsed(
  parser: ProgramParser,
  ix: Instruction,
  parsedCache: (ParsedIx | undefined)[],
  i: number,
): ParsedIx {
  let parsed = parsedCache[i];
  if (!parsed) {
    parsed = parser.parse(ix);
    parsedCache[i] = parsed;
  }
  return parsed;
}

function matchingAllows(
  prog: CompiledProgram,
  data: Uint8Array,
  parser: ProgramParser | undefined,
  parsedCache: (ParsedIx | undefined)[],
  i: number,
  ix: Instruction,
): CompiledRule[] {
  const out: CompiledRule[] = [];

  for (const bucket of prog.allowDiscBuckets) {
    if (!discEqBytes(data, bucket.disc)) continue;
    for (const a of bucket.rules) {
      if (a.exactDataLength != null && data.length !== a.exactDataLength) {
        continue;
      }
      out.push(a);
    }
  }

  if (prog.allowRulesNoDisc.length > 0) {
    const name = identifyIx(data, prog, parser, parsedCache, i, ix);
    if (name) {
      for (const a of prog.allowRulesNoDisc) {
        if (a.instruction === name) out.push(a);
      }
    }
  }
  return out;
}

function verifyCompiled(
  compiled: CompiledPolicy,
  instructions: readonly Instruction[],
  byProgramId: Map<string, ProgramParser>,
): VerifyResult {
  if (instructions.length === 0) {
    return fail("unexpected_instruction", "Transaction has no instructions.");
  }

  const parsedCache: (ParsedIx | undefined)[] = new Array(instructions.length);

  for (let i = 0; i < instructions.length; i++) {
    const ix = instructions[i]!;
    if (ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS) {
      return failAt(
        i,
        "compute_budget_not_allowed",
        "Compute Budget instructions are not allowed in policy verification (they are applied by the wallet).",
        { programId: COMPUTE_BUDGET_PROGRAM_ADDRESS },
      );
    }

    const programId = String(ix.programAddress);
    const prog = compiled.programs.get(programId);
    if (!prog) {
      return failAt(
        i,
        "program_not_allowed",
        "This program isn’t allowed by your policy.",
        { programId: ix.programAddress },
      );
    }

    // Pure allowAll: programId alone is enough — no parser, no decode.
    // (allowAll + aggregates for this program is rejected at compile.)
    if (prog.allowAll && prog.denies.length === 0) {
      continue;
    }

    const parser = byProgramId.get(programId);
    const data = ixData(ix);
    const ctx = makeEvalCtx(ix, data);

    if (prog.deniesNeedParser && !parser) {
      return failAt(
        i,
        "parser_not_found",
        `Program ${prog.programId} has denies but no parser is registered.`,
        { programId: prog.programId },
      );
    }

    for (const deny of prog.denies) {
      const discOk =
        deny.discriminator.length > 0
          ? discEqBytes(data, deny.discriminator)
          : identifyIx(data, prog, parser, parsedCache, i, ix) ===
            deny.instruction;
      if (!discOk) continue;

      const pred = evalPredicateGroups(ctx, deny.groups);
      if (!pred.ok) continue;

      if (deny.requireParseConfirm) {
        if (!parser) {
          return failAt(i, "parser_not_found", `No parser for ${prog.programId}`, {
            programId: prog.programId,
          });
        }
        const parsed = ensureParsed(parser, ix, parsedCache, i);
        if (parsed.instructionName !== deny.instruction) continue;
        if (deny.parsedPredicates.length > 0) {
          const pp = evalParsedPredicates(parsed, deny.parsedPredicates);
          if (!pp.ok) continue;
        }
      }

      return failAtParsed(
        i,
        "instruction_denied",
        "This instruction is on the program deny list.",
        { instructionName: deny.instruction },
        parser,
        parsedCache,
        ix,
      );
    }

    if (prog.allowAll) continue;

    const matching = matchingAllows(prog, data, parser, parsedCache, i, ix);

    if (matching.length === 0) {
      const name = identifyIx(data, prog, parser, parsedCache, i, ix);
      return failAtParsed(
        i,
        "instruction_not_allowed",
        name == null
          ? "This instruction isn’t recognized by the policy parser."
          : "This instruction isn’t allowed by your policy.",
        { instructionName: name ?? "Unknown" },
        parser,
        parsedCache,
        ix,
      );
    }

    let anyPass = false;
    let lastPredFail: {
      field?: string;
      op?: string;
      limit?: string;
      actual?: string;
      spendLimit?: boolean;
    } | null = null;

    for (const allow of matching) {
      const pred = evalPredicateGroups(ctx, allow.groups);
      if (!pred.ok) {
        lastPredFail = pred;
        continue;
      }

      if (allow.requireParseConfirm) {
        if (!parser) {
          return failAt(
            i,
            "parser_not_found",
            `No parser for ${prog.programId}`,
            { programId: prog.programId },
          );
        }
        const parsed = ensureParsed(parser, ix, parsedCache, i);
        if (parsed.instructionName !== allow.instruction) {
          lastPredFail = { field: "instructionName" };
          continue;
        }
        if (allow.parsedPredicates.length > 0) {
          const pp = evalParsedPredicates(parsed, allow.parsedPredicates);
          if (!pp.ok) {
            lastPredFail = pp;
            continue;
          }
        }
      }

      anyPass = true;
      break;
    }

    if (!anyPass) {
      return failAtParsed(
        i,
        lastPredFail?.spendLimit ? "spend_limit" : "instruction_not_allowed",
        lastPredFail?.field
          ? `Policy condition failed on field ${lastPredFail.field}.`
          : "This instruction isn’t allowed by your policy.",
        {
          instructionName: matching[0]?.instruction,
          field: lastPredFail?.field,
          op: lastPredFail?.op,
          limit: lastPredFail?.limit,
          actual: lastPredFail?.actual,
        },
        parser,
        parsedCache,
        ix,
      );
    }
  }

  for (const agg of compiled.aggregates) {
    let sum = 0n;
    for (const src of agg.sources) {
      for (let i = 0; i < instructions.length; i++) {
        const ix = instructions[i]!;
        if (String(ix.programAddress) !== src.programId) continue;
        const data = ixData(ix);
        if (
          src.discriminator.length > 0 &&
          !discEqBytes(data, src.discriminator)
        ) {
          continue;
        }
        if (
          src.exactDataLength != null &&
          data.length !== src.exactDataLength
        ) {
          continue;
        }

        const ctx = makeEvalCtx(ix, data);
        const pred = evalPredicateGroups(ctx, src.groups);
        if (!pred.ok) continue;

        if (src.kind === "parsed" || src.requireParseConfirm) {
          const parser = byProgramId.get(src.programId);
          if (!parser) {
            return fail(
              "parser_not_found",
              `No parser for aggregate program ${src.programId}`,
              { programId: src.programId },
            );
          }
          const parsed = ensureParsed(parser, ix, parsedCache, i);
          if (parsed.instructionName !== src.instruction) continue;
          if (src.parsedPredicates.length > 0) {
            const pp = evalParsedPredicates(parsed, src.parsedPredicates);
            if (!pp.ok) continue;
          }
          if (src.kind === "parsed") {
            const fv = parsed.fields[src.field];
            if (!fv || (fv.type !== "bigint" && fv.type !== "number")) {
              return fail(
                "aggregate_failed",
                `Aggregate field ${src.field} missing or not bigint.`,
                {
                  programId: src.programId,
                  instruction: src.instruction,
                  field: src.field,
                },
              );
            }
            try {
              sum +=
                typeof fv.value === "bigint"
                  ? fv.value
                  : BigInt(String(fv.value));
            } catch {
              return fail(
                "aggregate_failed",
                `Aggregate field ${src.field} is not a valid bigint.`,
                { field: src.field },
              );
            }
            continue;
          }
        }

        if (src.kind !== "fixed") continue;
        const v = readDataInt(data, src.offset, src.type);
        if (v == null) {
          return fail(
            "aggregate_failed",
            `Aggregate field ${src.field} could not be read.`,
            {
              programId: src.programId,
              instruction: src.instruction,
              field: src.field,
            },
          );
        }
        sum += v;
      }
    }

    if (!compareInt(sum, agg.op, agg.limit)) {
      return fail("aggregate_limit", "Transaction aggregate limit exceeded.", {
        op: agg.op,
        limit: agg.valueRaw,
        actual: sum.toString(),
      });
    }
  }

  return { ok: true };
}

/**
 * Bind parsers once; verify policies against instructions.
 * STANDARD is not injected — pass `[...STANDARD_PARSERS, …]` yourself.
 * Layouts are collected once; policies are compiled on first use and cached.
 */
export function createVerifier(options: CreateVerifierOptions) {
  const indexed = indexParsers(options.parsers);
  if (!indexed.ok) {
    const err = indexed;
    return function verify(
      _policy: PolicyDocument,
      _instructions: readonly Instruction[],
    ): VerifyResult {
      return err;
    };
  }

  const byProgramId = indexed.parsers;
  const layoutsByProgram = collectLayoutsFromParsers(
    options.parsers,
    indexProgramLayouts(),
  );

  const byObject = new WeakMap<object, CompileResult>();
  const byJson = new Map<string, CompileResult>();

  function getCompiled(policy: PolicyDocument): CompileResult {
    if (policy && typeof policy === "object") {
      const hit = byObject.get(policy);
      if (hit) return hit;
    }

    let key: string | undefined;
    try {
      key = JSON.stringify(policy);
    } catch {
      key = undefined;
    }
    if (key != null) {
      const hit = byJson.get(key);
      if (hit) {
        if (policy && typeof policy === "object") byObject.set(policy, hit);
        return hit;
      }
    }

    const compiled = compilePolicy(policy, { layoutsByProgram });
    if (policy && typeof policy === "object") byObject.set(policy, compiled);
    if (key != null) {
      byJson.set(key, compiled);
      if (byJson.size > JSON_CACHE_MAX) {
        const first = byJson.keys().next().value;
        if (first != null) byJson.delete(first);
      }
    }
    return compiled;
  }

  return function verify(
    policy: PolicyDocument,
    instructions: readonly Instruction[],
  ): VerifyResult {
    const compiled = getCompiled(policy);
    if (!compiled.ok) return compiled;
    return verifyCompiled(compiled.policy, instructions, byProgramId);
  };
}
