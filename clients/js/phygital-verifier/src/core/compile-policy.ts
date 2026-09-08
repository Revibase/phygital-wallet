/**
 * Compile a PolicyDocument into byte/account predicates for hot-path verify.
 * Uncompilable `when` → invalid_policy (no legacy expr fallback).
 */
import { address, getAddressEncoder, type Address } from "@solana/addresses";
import type { Instruction } from "@solana/instructions";
import type { InstructionLayout } from "./layout.js";
import type {
  AggregateOp,
  ConditionOp,
  ParsedIx,
  PolicyCondition,
  PolicyDocument,
  PolicyExpr,
  ProgramParser,
  VerifyFail,
} from "./types.js";
import { isPolicyCondition } from "./types.js";
import {
  bytesEqual,
  bytesEqualAt,
  discEq,
} from "../parsers/codec-readers.js";

const addressEncoder = getAddressEncoder();
const EMPTY_DATA = new Uint8Array();

/** Base58 / Address → 32 pubkey bytes (Solana memcmp target). */
function encodeAddressBytes(addr: string | Address): Uint8Array | null {
  try {
    const a = typeof addr === "string" ? address(addr) : addr;
    return new Uint8Array(addressEncoder.encode(a));
  } catch {
    return null;
  }
}

export type AccountPredicate = {
  readonly kind: "account";
  readonly index: number;
  readonly op: "eq" | "neq" | "in";
  readonly values: readonly Uint8Array[];
  readonly display: readonly string[];
};

export type DataIntPredicate = {
  readonly kind: "dataInt";
  readonly offset: number;
  readonly size: number;
  readonly type: "u8" | "u16" | "u32" | "u64" | "u128";
  readonly op: AggregateOp;
  readonly limit: bigint;
  readonly field: string;
  /** Map fail → spend_limit for amount-like fields. */
  readonly spendLimit?: boolean;
};

export type DataBytesPredicate = {
  readonly kind: "dataBytes";
  readonly offset: number;
  readonly size: number;
  readonly op: "eq" | "neq";
  readonly expected: Uint8Array;
  readonly field: string;
};

/** Dynamic field — evaluated after a narrow parser parse. */
export type ParsedIntPredicate = {
  readonly kind: "parsedInt";
  readonly field: string;
  readonly op: AggregateOp;
  readonly limit: bigint;
  readonly spendLimit?: boolean;
};

export type Predicate =
  | AccountPredicate
  | DataIntPredicate
  | DataBytesPredicate;

export type DiscEntry = {
  readonly disc: Uint8Array;
  readonly name: string;
};

export type CompiledRule = {
  readonly instruction: string;
  readonly discriminator: Uint8Array;
  /**
   * OR of AND-groups. Empty `when` → `[[]]` (always true after disc).
   * Allow passes if any group’s predicates all pass.
   */
  readonly groups: readonly (readonly Predicate[])[];
  /** Extra AND after a group passes; requires parser.parse. */
  readonly parsedPredicates: readonly ParsedIntPredicate[];
  readonly exactDataLength?: number;
  /** Variable-length / dynamic: parse must return this instruction name. */
  readonly requireParseConfirm: boolean;
};

/** Allow rules keyed by fixed discriminator (longest disc first). */
export type AllowDiscBucket = {
  readonly disc: Uint8Array;
  readonly rules: readonly CompiledRule[];
};

export type CompiledProgram = {
  readonly programId: string;
  readonly allowAll: boolean;
  readonly denies: readonly CompiledRule[];
  /** True when any deny needs parser.parse / name identity. */
  readonly deniesNeedParser: boolean;
  /** Longest-disc-first layout discs for instruction identity. */
  readonly discEntries: readonly DiscEntry[];
  /** Allow rules with fixed discs (longest first). */
  readonly allowDiscBuckets: readonly AllowDiscBucket[];
  /** Allow rules without a layout disc (name match via identify). */
  readonly allowRulesNoDisc: readonly CompiledRule[];
};

export type CompiledAggregateSourceBase = {
  readonly programId: string;
  readonly instruction: string;
  readonly discriminator: Uint8Array;
  readonly field: string;
  readonly groups: readonly (readonly Predicate[])[];
  readonly parsedPredicates: readonly ParsedIntPredicate[];
  readonly exactDataLength?: number;
  readonly requireParseConfirm: boolean;
};

/** Sum a fixed-offset integer from ix data. */
export type FixedAggregateSource = CompiledAggregateSourceBase & {
  readonly kind: "fixed";
  readonly offset: number;
  readonly size: number;
  readonly type: "u8" | "u16" | "u32" | "u64" | "u128";
};

/** Sum a bigint field after parser.decode. */
export type ParsedAggregateSource = CompiledAggregateSourceBase & {
  readonly kind: "parsed";
};

export type CompiledAggregateSource =
  | FixedAggregateSource
  | ParsedAggregateSource;

export type CompiledAggregate = {
  readonly sources: readonly CompiledAggregateSource[];
  readonly op: AggregateOp;
  readonly limit: bigint;
  readonly valueRaw: string;
};

export type CompiledPolicy = {
  readonly programs: ReadonlyMap<string, CompiledProgram>;
  readonly aggregates: readonly CompiledAggregate[];
};

/** Result of `compilePolicy` (explicit ok discriminant). */
export type CompileResult =
  | { readonly ok: true; readonly policy: CompiledPolicy }
  | VerifyFail;

export type PredEvalFail = {
  ok: false;
  field?: string;
  op?: string;
  limit?: string;
  actual?: string;
  spendLimit?: boolean;
};

export type PredEvalOk = { ok: true };

export type EvalCtx = {
  readonly data: Uint8Array;
  /** Lazily filled 32-byte encodings by account index. */
  readonly accountBytes: (Uint8Array | null | undefined)[];
  readonly accounts: readonly { address: Address | string }[];
};

function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): VerifyFail {
  return { ok: false, code, message, details };
}

function layoutFor(
  layoutsByProgram: Map<string, Map<string, InstructionLayout>>,
  programId: string,
  instruction: string,
): InstructionLayout | undefined {
  return layoutsByProgram.get(programId)?.get(instruction);
}

const INT_OPS = new Set<AggregateOp>(["eq", "neq", "lt", "lte", "gt", "gte"]);

function isSpendLimitField(field: string): boolean {
  return field === "amount" || field === "transferArgs.amount";
}

function invertOp(op: ConditionOp): ConditionOp | null {
  switch (op) {
    case "eq":
      return "neq";
    case "neq":
      return "eq";
    case "lt":
      return "gte";
    case "lte":
      return "gt";
    case "gt":
      return "lte";
    case "gte":
      return "lt";
    default:
      return null;
  }
}

type LowerOk = {
  ok: true;
  groups: Predicate[][];
  parsed: ParsedIntPredicate[];
};
type LowerFail = { ok: false; reason: string };

function lowerParsedInt(c: PolicyCondition): LowerOk | LowerFail {
  if (c.type !== "bigint" && c.type !== "number") {
    return { ok: false, reason: `dynamic field type ${c.type}` };
  }
  if (!INT_OPS.has(c.op as AggregateOp)) {
    return { ok: false, reason: `dynamic field op ${c.op}` };
  }
  const raw = Array.isArray(c.value) ? c.value[0] : c.value;
  if (raw == null) return { ok: false, reason: "missing limit" };
  let limit: bigint;
  try {
    limit = BigInt(raw);
  } catch {
    return { ok: false, reason: "bad bigint" };
  }
  return {
    ok: true,
    groups: [[]],
    parsed: [
      {
        kind: "parsedInt",
        field: c.field,
        op: c.op as AggregateOp,
        limit,
        spendLimit: isSpendLimitField(c.field) || undefined,
      },
    ],
  };
}

function lowerLeaf(
  c: PolicyCondition,
  layout: InstructionLayout | undefined,
): LowerOk | LowerFail {
  if (!layout) {
    return { ok: false, reason: `no layout for ${c.field}` };
  }
  const fl = layout.fields[c.field];
  if (!fl) {
    return { ok: false, reason: `missing field ${c.field}` };
  }
  if (fl.kind === "dynamic") {
    return lowerParsedInt(c);
  }

  if (fl.kind === "account") {
    if (c.type !== "string" && c.type !== "bytes") {
      return { ok: false, reason: `account field type ${c.type}` };
    }
    if (c.op === "eq" || c.op === "neq") {
      const v = Array.isArray(c.value) ? c.value[0] : c.value;
      if (v == null || typeof v !== "string") {
        return { ok: false, reason: "missing address value" };
      }
      const bytes = encodeAddressBytes(v);
      if (!bytes) return { ok: false, reason: `invalid address ${v}` };
      return {
        ok: true,
        groups: [
          [
            {
              kind: "account",
              index: fl.index,
              op: c.op,
              values: [bytes],
              display: [v],
            },
          ],
        ],
        parsed: [],
      };
    }
    if (c.op === "in") {
      const vals = (Array.isArray(c.value) ? c.value : [c.value]).filter(
        (x): x is string => typeof x === "string",
      );
      if (vals.length === 0) return { ok: false, reason: "empty in-list" };
      const encoded: Uint8Array[] = [];
      for (const v of vals) {
        const bytes = encodeAddressBytes(v);
        if (!bytes) return { ok: false, reason: `invalid address ${v}` };
        encoded.push(bytes);
      }
      return {
        ok: true,
        groups: [
          [
            {
              kind: "account",
              index: fl.index,
              op: "in",
              values: encoded,
              display: vals,
            },
          ],
        ],
        parsed: [],
      };
    }
    return { ok: false, reason: `account op ${c.op}` };
  }

  if (
    fl.type === "u8" ||
    fl.type === "u16" ||
    fl.type === "u32" ||
    fl.type === "u64" ||
    fl.type === "u128"
  ) {
    if (c.type !== "bigint" && c.type !== "number") {
      return { ok: false, reason: `int field policy type ${c.type}` };
    }
    const op = c.op;
    if (!INT_OPS.has(op as AggregateOp)) {
      return { ok: false, reason: `int op ${op}` };
    }
    const raw = Array.isArray(c.value) ? c.value[0] : c.value;
    if (raw == null) return { ok: false, reason: "missing limit" };
    let limit: bigint;
    try {
      limit = BigInt(raw);
    } catch {
      return { ok: false, reason: "bad bigint" };
    }
    return {
      ok: true,
      groups: [
        [
          {
            kind: "dataInt",
            offset: fl.offset,
            size: fl.size,
            type: fl.type,
            op: op as AggregateOp,
            limit,
            field: c.field,
            spendLimit: isSpendLimitField(c.field) || undefined,
          },
        ],
      ],
      parsed: [],
    };
  }

  if (fl.type === "pubkey") {
    if (c.op !== "eq" && c.op !== "neq") {
      return { ok: false, reason: `bytes op ${c.op}` };
    }
    const raw = Array.isArray(c.value) ? c.value[0] : c.value;
    if (raw == null || typeof raw !== "string") {
      return { ok: false, reason: "missing pubkey value" };
    }
    const expected = encodeAddressBytes(raw);
    if (!expected) return { ok: false, reason: `invalid address ${raw}` };
    return {
      ok: true,
      groups: [
        [
          {
            kind: "dataBytes",
            offset: fl.offset,
            size: 32,
            op: c.op,
            expected,
            field: c.field,
          },
        ],
      ],
      parsed: [],
    };
  }

  if (fl.type === "bytes") {
    if (c.op !== "eq" && c.op !== "neq") {
      return { ok: false, reason: `bytes op ${c.op}` };
    }
    const raw = Array.isArray(c.value) ? c.value : null;
    if (!raw || raw.length !== fl.size) {
      return { ok: false, reason: "bytes value length mismatch" };
    }
    if (!raw.every((n) => typeof n === "number" && n >= 0 && n <= 255)) {
      return { ok: false, reason: "bytes value not u8 array" };
    }
    return {
      ok: true,
      groups: [
        [
          {
            kind: "dataBytes",
            offset: fl.offset,
            size: fl.size,
            op: c.op,
            expected: Uint8Array.from(raw as number[]),
            field: c.field,
          },
        ],
      ],
      parsed: [],
    };
  }

  return { ok: false, reason: "unsupported data type" };
}

function mergeAnd(parts: LowerOk[]): LowerOk | LowerFail {
  const preds: Predicate[] = [];
  const parsed: ParsedIntPredicate[] = [];
  for (const p of parts) {
    if (p.groups.length !== 1) {
      return {
        ok: false,
        reason: "and cannot nest or-groups (normalize or flatten)",
      };
    }
    preds.push(...(p.groups[0] ?? []));
    parsed.push(...p.parsed);
  }
  return { ok: true, groups: [preds], parsed };
}

/** Fully compile when; fail if anything cannot be lowered. */
function lowerExpr(
  expr: PolicyExpr | undefined,
  layout: InstructionLayout | undefined,
): LowerOk | LowerFail {
  if (expr == null) return { ok: true, groups: [[]], parsed: [] };

  if (isPolicyCondition(expr)) {
    return lowerLeaf(expr, layout);
  }

  if ("and" in expr) {
    if (!expr.and || expr.and.length === 0) {
      return { ok: false, reason: "empty and" };
    }
    const parts: LowerOk[] = [];
    for (const child of expr.and) {
      const sub = lowerExpr(child, layout);
      if (!sub.ok) return sub;
      if (sub.groups.length !== 1) {
        return {
          ok: false,
          reason: "and cannot nest or-groups (normalize or flatten)",
        };
      }
      parts.push(sub);
    }
    return mergeAnd(parts);
  }

  if ("or" in expr) {
    if (!expr.or || expr.or.length === 0) {
      return { ok: false, reason: "empty or" };
    }
    const groups: Predicate[][] = [];
    const parsed: ParsedIntPredicate[] = [];
    for (const child of expr.or) {
      const sub = lowerExpr(child, layout);
      if (!sub.ok) return sub;
      if (sub.parsed.length > 0) {
        return {
          ok: false,
          reason: "or cannot mix dynamic parsed fields (use and)",
        };
      }
      for (const g of sub.groups) groups.push([...g]);
    }
    return { ok: true, groups, parsed };
  }

  if ("not" in expr) {
    if (!isPolicyCondition(expr.not)) {
      return {
        ok: false,
        reason: "not only allowed over a single leaf condition",
      };
    }
    const inv = invertOp(expr.not.op);
    if (!inv) {
      return { ok: false, reason: `cannot invert op ${expr.not.op}` };
    }
    return lowerLeaf({ ...expr.not, op: inv }, layout);
  }

  return { ok: false, reason: "unrecognized when shape" };
}

type CompileRuleResult =
  | { ok: true; rule: CompiledRule }
  | VerifyFail;

function compileRule(
  instruction: string,
  when: PolicyExpr | undefined,
  layout: InstructionLayout | undefined,
): CompileRuleResult {
  if (!layout) {
    if (when != null) {
      return fail(
        "invalid_policy",
        `No layout for instruction ${instruction}; when clauses require a layout.`,
        { instruction },
      );
    }
    return {
      ok: true,
      rule: {
        instruction,
        discriminator: EMPTY_DATA,
        groups: [[]],
        parsedPredicates: [],
        requireParseConfirm: true,
      },
    };
  }

  const lowered = lowerExpr(when, layout);
  if (!lowered.ok) {
    return fail(
      "invalid_policy",
      `Cannot compile when for ${instruction}: ${lowered.reason}`,
      { instruction, reason: lowered.reason },
    );
  }

  const hasDynamic = Object.values(layout.fields).some(
    (f) => f.kind === "dynamic",
  );
  const requireParseConfirm =
    layout.exactDataLength == null ||
    hasDynamic ||
    lowered.parsed.length > 0;

  return {
    ok: true,
    rule: {
      instruction,
      discriminator: layout.discriminator,
      groups: lowered.groups,
      parsedPredicates: lowered.parsed,
      exactDataLength: layout.exactDataLength,
      requireParseConfirm,
    },
  };
}

function buildDiscEntries(
  layouts: Map<string, InstructionLayout> | undefined,
): DiscEntry[] {
  if (!layouts) return [];
  const entries: DiscEntry[] = [];
  for (const [name, layout] of layouts) {
    entries.push({ disc: layout.discriminator, name });
  }
  entries.sort((a, b) => b.disc.length - a.disc.length);
  return entries;
}

function indexAllowDiscs(allows: readonly CompiledRule[]): {
  allowDiscBuckets: AllowDiscBucket[];
  allowRulesNoDisc: CompiledRule[];
} {
  const byRef = new Map<Uint8Array, CompiledRule[]>();
  const order: Uint8Array[] = [];
  const allowRulesNoDisc: CompiledRule[] = [];
  for (const a of allows) {
    if (a.discriminator.length === 0) {
      allowRulesNoDisc.push(a);
      continue;
    }
    let list = byRef.get(a.discriminator);
    if (!list) {
      list = [];
      byRef.set(a.discriminator, list);
      order.push(a.discriminator);
    }
    list.push(a);
  }
  order.sort((a, b) => b.length - a.length);
  return {
    allowDiscBuckets: order.map((disc) => ({
      disc,
      rules: byRef.get(disc)!,
    })),
    allowRulesNoDisc,
  };
}

export type CompilePolicyOptions = {
  layoutsByProgram: Map<string, Map<string, InstructionLayout>>;
};

/**
 * Compile policy for the byte verify path.
 * Includes former validatePolicy shape checks. Fails closed if any `when`
 * cannot be fully lowered. Internal to createVerifier (not a public API).
 */
export function compilePolicy(
  policy: PolicyDocument,
  options: CompilePolicyOptions,
): CompileResult {
  if (!policy || typeof policy !== "object") {
    return fail("invalid_policy", "Policy must be an object.");
  }
  if (!Array.isArray(policy.programs)) {
    return fail("invalid_policy", "Policy programs must be an array.");
  }

  const programs = new Map<string, CompiledProgram>();
  const seen = new Set<string>();
  const aggregatedPrograms = new Set<string>();

  for (const agg of policy.transaction?.aggregates ?? []) {
    if (!agg.fields || agg.fields.length === 0) {
      return fail(
        "invalid_policy",
        "Aggregate with empty fields is not allowed (fail closed).",
      );
    }
    const seenSrc = new Set<string>();
    for (const src of agg.fields) {
      const key = `${src.programId}\0${src.instruction}\0${src.field}`;
      if (seenSrc.has(key)) {
        return fail(
          "invalid_policy",
          "Duplicate aggregate field source (would double-count).",
          {
            programId: src.programId,
            instruction: src.instruction,
            field: src.field,
          },
        );
      }
      seenSrc.add(key);
      aggregatedPrograms.add(src.programId);
    }
  }

  for (const block of policy.programs) {
    if (seen.has(block.programId)) {
      return fail("invalid_policy", `Duplicate programId: ${block.programId}`, {
        programId: block.programId,
      });
    }
    seen.add(block.programId);

    if (block.allowAll === true && aggregatedPrograms.has(block.programId)) {
      return fail(
        "invalid_policy",
        `Program ${block.programId} uses allowAll but is referenced by aggregates; use an explicit allows list.`,
        { programId: block.programId },
      );
    }

    const layouts = options.layoutsByProgram.get(block.programId);
    const allows: CompiledRule[] = [];
    for (const a of block.allows ?? []) {
      const rule = compileRule(
        a.instruction,
        a.when,
        layoutFor(options.layoutsByProgram, block.programId, a.instruction),
      );
      if (!rule.ok) return rule;
      allows.push(rule.rule);
    }
    const denies: CompiledRule[] = [];
    for (const d of block.denies ?? []) {
      const rule = compileRule(
        d.instruction,
        d.when,
        layoutFor(options.layoutsByProgram, block.programId, d.instruction),
      );
      if (!rule.ok) return rule;
      denies.push(rule.rule);
    }

    const { allowDiscBuckets, allowRulesNoDisc } = indexAllowDiscs(allows);
    programs.set(block.programId, {
      programId: block.programId,
      allowAll: block.allowAll === true,
      denies,
      deniesNeedParser: denies.some(
        (d) =>
          d.discriminator.length === 0 ||
          d.requireParseConfirm ||
          d.parsedPredicates.length > 0,
      ),
      discEntries: buildDiscEntries(layouts),
      allowDiscBuckets,
      allowRulesNoDisc,
    });
  }

  const aggregates: CompiledAggregate[] = [];

  for (const agg of policy.transaction?.aggregates ?? []) {
    let limit: bigint;
    try {
      limit = BigInt(agg.value);
    } catch {
      return fail(
        "invalid_policy",
        "Aggregate limit value is not a valid bigint.",
        { value: agg.value },
      );
    }
    const sources: CompiledAggregateSource[] = [];
    for (const src of agg.fields) {
      const layout = layoutFor(
        options.layoutsByProgram,
        src.programId,
        src.instruction,
      );
      const fl = layout?.fields[src.field];
      const lowered = lowerExpr(src.when, layout);
      if (!lowered.ok) {
        return fail(
          "invalid_policy",
          `Cannot compile aggregate when: ${lowered.reason}`,
          {
            programId: src.programId,
            instruction: src.instruction,
            field: src.field,
            reason: lowered.reason,
          },
        );
      }

      const fixedInt =
        layout &&
        fl &&
        fl.kind === "data" &&
        (fl.type === "u8" ||
          fl.type === "u16" ||
          fl.type === "u32" ||
          fl.type === "u64" ||
          fl.type === "u128");

      if (!fixedInt) {
        sources.push({
          kind: "parsed",
          programId: src.programId,
          instruction: src.instruction,
          discriminator: layout?.discriminator ?? EMPTY_DATA,
          field: src.field,
          groups: lowered.groups,
          parsedPredicates: lowered.parsed,
          exactDataLength: layout?.exactDataLength,
          requireParseConfirm: true,
        });
        continue;
      }

      sources.push({
        kind: "fixed",
        programId: src.programId,
        instruction: src.instruction,
        discriminator: layout.discriminator,
        field: src.field,
        offset: fl.offset,
        size: fl.size,
        type: fl.type,
        groups: lowered.groups,
        parsedPredicates: lowered.parsed,
        exactDataLength: layout.exactDataLength,
        requireParseConfirm:
          layout.exactDataLength == null || lowered.parsed.length > 0,
      });
    }
    aggregates.push({
      sources,
      op: agg.op,
      limit,
      valueRaw: agg.value,
    });
  }

  return {
    ok: true,
    policy: { programs, aggregates },
  };
}

const dataViewCache = new WeakMap<Uint8Array, DataView>();

function dataViewFor(data: Uint8Array): DataView {
  let v = dataViewCache.get(data);
  if (!v) {
    v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    dataViewCache.set(data, v);
  }
  return v;
}

/** Hot-path LE integer reads (DataView — no codec try/catch). */
export function readDataInt(
  data: Uint8Array,
  offset: number,
  type: DataIntPredicate["type"],
): bigint | null {
  switch (type) {
    case "u8": {
      if (data.length <= offset) return null;
      return BigInt(data[offset]!);
    }
    case "u16": {
      if (data.length < offset + 2) return null;
      return BigInt(dataViewFor(data).getUint16(offset, true));
    }
    case "u32": {
      if (data.length < offset + 4) return null;
      return BigInt(dataViewFor(data).getUint32(offset, true));
    }
    case "u64": {
      if (data.length < offset + 8) return null;
      return dataViewFor(data).getBigUint64(offset, true);
    }
    case "u128": {
      if (data.length < offset + 16) return null;
      const view = dataViewFor(data);
      const lo = view.getBigUint64(offset, true);
      const hi = view.getBigUint64(offset + 8, true);
      return lo + (hi << 64n);
    }
    default:
      return null;
  }
}

export function compareInt(
  left: bigint,
  op: AggregateOp | ConditionOp,
  right: bigint,
): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    default:
      return false;
  }
}

function accountBytesAt(ctx: EvalCtx, index: number): Uint8Array | null {
  const cached = ctx.accountBytes[index];
  if (cached !== undefined) return cached;
  const addr = ctx.accounts[index]?.address;
  if (addr == null) {
    ctx.accountBytes[index] = null;
    return null;
  }
  const bytes = encodeAddressBytes(addr);
  ctx.accountBytes[index] = bytes;
  return bytes;
}

/** Normalize instruction data once (shared empty buffer when absent). */
export function ixData(ix: Instruction): Uint8Array {
  if (!ix.data) return EMPTY_DATA;
  return ix.data instanceof Uint8Array ? ix.data : new Uint8Array(ix.data);
}

export function makeEvalCtx(ix: Instruction, data?: Uint8Array): EvalCtx {
  return {
    data: data ?? ixData(ix),
    accountBytes: [],
    accounts: ix.accounts ?? [],
  };
}

export function evalPredicates(
  ctx: EvalCtx,
  predicates: readonly Predicate[],
): PredEvalOk | PredEvalFail {
  for (const p of predicates) {
    if (p.kind === "account") {
      const addr = ctx.accounts[p.index]?.address;
      if (addr == null) return { ok: false, field: `accounts[${p.index}]` };
      const actual = accountBytesAt(ctx, p.index);
      if (actual == null) {
        return { ok: false, field: `accounts[${p.index}]`, op: p.op };
      }
      if (p.op === "eq") {
        if (!bytesEqual(actual, p.values[0]!)) {
          return {
            ok: false,
            field: `accounts[${p.index}]`,
            op: "eq",
            limit: p.display[0],
            actual: String(addr),
          };
        }
      } else if (p.op === "neq") {
        if (bytesEqual(actual, p.values[0]!)) {
          return { ok: false, field: `accounts[${p.index}]`, op: "neq" };
        }
      } else if (p.op === "in") {
        if (!p.values.some((v) => bytesEqual(actual, v))) {
          return { ok: false, field: `accounts[${p.index}]`, op: "in" };
        }
      }
      continue;
    }

    if (p.kind === "dataInt") {
      const v = readDataInt(ctx.data, p.offset, p.type);
      if (v == null) return { ok: false, field: p.field };
      if (!compareInt(v, p.op, p.limit)) {
        return {
          ok: false,
          field: p.field,
          op: p.op,
          limit: p.limit.toString(),
          actual: v.toString(),
          spendLimit: p.spendLimit,
        };
      }
      continue;
    }

    if (p.kind === "dataBytes") {
      const eq = bytesEqualAt(ctx.data, p.offset, p.expected);
      if (p.op === "eq" && !eq) return { ok: false, field: p.field, op: "eq" };
      if (p.op === "neq" && eq) return { ok: false, field: p.field, op: "neq" };
    }
  }
  return { ok: true };
}

/** OR of AND-groups. */
export function evalPredicateGroups(
  ctx: EvalCtx,
  groups: readonly (readonly Predicate[])[],
): PredEvalOk | PredEvalFail {
  let last: PredEvalFail | null = null;
  for (const g of groups) {
    const r = evalPredicates(ctx, g);
    if (r.ok) return r;
    last = r;
  }
  return last ?? { ok: false };
}

export function evalParsedPredicates(
  parsed: ParsedIx,
  preds: readonly ParsedIntPredicate[],
): PredEvalOk | PredEvalFail {
  for (const p of preds) {
    const fv = parsed.fields[p.field];
    if (!fv || (fv.type !== "bigint" && fv.type !== "number")) {
      return { ok: false, field: p.field };
    }
    let v: bigint;
    try {
      v = typeof fv.value === "bigint" ? fv.value : BigInt(String(fv.value));
    } catch {
      return { ok: false, field: p.field };
    }
    if (!compareInt(v, p.op, p.limit)) {
      return {
        ok: false,
        field: p.field,
        op: p.op,
        limit: p.limit.toString(),
        actual: v.toString(),
        spendLimit: p.spendLimit,
      };
    }
  }
  return { ok: true };
}

export function discEqBytes(data: Uint8Array, expected: Uint8Array): boolean {
  return discEq(data, expected);
}

/** Match instruction name from disc entries (longest first). */
export function identifyByDiscEntries(
  data: Uint8Array,
  entries: readonly DiscEntry[],
): string | null {
  for (const e of entries) {
    if (discEq(data, e.disc)) return e.name;
  }
  return null;
}

export function collectLayoutsFromParsers(
  parsers: readonly ProgramParser[],
  fallback: Map<string, Map<string, InstructionLayout>>,
): Map<string, Map<string, InstructionLayout>> {
  const out = new Map<string, Map<string, InstructionLayout>>();
  for (const [pid, m] of fallback) {
    out.set(pid, new Map(m));
  }
  for (const p of parsers) {
    if (!p.layouts?.length) continue;
    let m = out.get(p.programId);
    if (!m) {
      m = new Map();
      out.set(p.programId, m);
    }
    for (const ix of p.layouts) m.set(ix.name, ix);
  }
  return out;
}
