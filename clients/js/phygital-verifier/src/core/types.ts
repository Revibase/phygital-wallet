/**
 * Shared types for policies, parsers, and verify results.
 * Start here when learning the data model.
 *
 * Instruction input is the Kit type from `@solana/instructions` so txs from
 * `@solana/kit` / Codama clients pass through without reshaping.
 */
export type { Instruction } from "@solana/instructions";
import type { Instruction } from "@solana/instructions";

/**
 * Decoded / condition field kinds.
 * - bigint / number / string / bool — scalars (amounts stay decimal strings)
 * - bytes — base58 of the raw byte blob (same alphabet as addresses)
 * - json — JSON text for vec/array/map in **parser output** (not used in compiled `when`)
 */
export type FieldType =
  | "bigint"
  | "number"
  | "string"
  | "bool"
  | "bytes"
  | "json";

export type FieldValue = {
  type: FieldType;
  value: bigint | number | string | boolean;
};

export type ParsedIx = {
  programId: string;
  instructionName: string;
  fields: Record<string, FieldValue>;
};

export type FieldSchemaEntry = {
  instruction: string;
  fields: readonly { name: string; type: FieldType }[];
};

export type ProgramParser = {
  programId: string;
  /** Decode ix data+accounts; Unknown if disc not recognized. */
  parse: (ix: Instruction) => ParsedIx;
  fieldSchema: readonly FieldSchemaEntry[];
  /** Optional fixed layouts for byte-oriented verify. */
  layouts?: readonly import("./layout.js").InstructionLayout[];
};

/** Ops supported by compiled policy `when` leaves. */
export type ConditionOp =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in";

/** JSON-safe condition (bigint as decimal string; bytes/pubkeys as base58; bool as "true"/"false"). */
export type PolicyCondition = {
  field: string;
  type: FieldType;
  op: ConditionOp;
  value: string | string[];
};

/** Nested boolean expression over leaf conditions. */
export type PolicyExpr =
  | PolicyCondition
  | { and: PolicyExpr[] }
  | { or: PolicyExpr[] }
  | { not: PolicyExpr };

export type InstructionAllow = {
  instruction: string;
  when?: PolicyExpr;
};

/** Deny a specific instruction (optional `when` — expression must match to deny). */
export type InstructionDeny = {
  instruction: string;
  when?: PolicyExpr;
};

/**
 * Stored program block — keyed by programId only.
 *
 * Verify order: allowAll → denies → allows.
 * - `allowAll: true` with no denies ⇒ allow any ix for that `programId`; **no parser required**
 * - `allowAll: true` with denies ⇒ parser required to evaluate denies (else `parser_not_found`)
 * - `allowAll` + aggregates for that program ⇒ `invalid_policy`
 * - else ⇒ parser + match an entry in `allows`
 * Empty `and`/`or`, duplicate `programId`s, and NOT over missing fields fail closed.
 */
export type ProgramPolicy = {
  programId: string;
  allowAll?: boolean;
  allows?: InstructionAllow[];
  denies?: InstructionDeny[];
};

export type AggregateOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

/** One bigint field to include in a sum. */
export type AggregateField = {
  programId: string;
  instruction: string;
  /** Bigint path to add (e.g. `amount`). */
  field: string;
  /**
   * Per-source filter (e.g. mint eq USDC). Field names are program-specific —
   * do not assume every source uses `mint`.
   */
  when?: PolicyExpr;
};

/**
 * Sum matching instruction fields across the tx, then compare once.
 * Each `fields` entry chooses what to sum and optionally which ixs qualify;
 * `op`/`value` compare the total.
 */
export type TransactionAggregate = {
  fields: AggregateField[];
  op: AggregateOp;
  value: string;
};

export type TransactionConstraints = {
  aggregates?: TransactionAggregate[];
};

export type PolicyDocument = {
  version?: string;
  programs: ProgramPolicy[];
  transaction?: TransactionConstraints;
};

export type VerifyOk = { ok: true };

/**
 * Structured fail context for UX / co-signer mapping.
 * Instruction-scoped fails include decoded fields when a parser is registered.
 */
export type VerifyFailDetails = {
  instructionIndex?: number;
  programId?: string;
  instructionName?: string | null;
  /** Condition field that failed (`when` / deny). */
  field?: string;
  op?: string;
  limit?: string;
  actual?: string;
  /** Decoded mint when present on the instruction. */
  mint?: string;
  /** Decoded amount as a decimal string (`amount` or `transferArgs.amount`). */
  amount?: string;
  /**
   * Token decimals used to format {@link amountUi}.
   * From `transferChecked.decimals` for SPL mints; `9` only for native
   * System `transfer` / `transferWithSeed` (lamports).
   */
  decimals?: number;
  /** Human-readable amount (`amount` ÷ 10^decimals). Prefer this for UX. */
  amountUi?: string;
  /**
   * Decoded send recipient (first of destinationOwner / newLeafOwner /
   * newOwner / wallet / destination).
   */
  destination?: string;
  [key: string]: unknown;
};

export type VerifyFail = {
  ok: false;
  code: string;
  message: string;
  details?: VerifyFailDetails;
};

export type VerifyResult = VerifyOk | VerifyFail;

export function isPolicyCondition(expr: PolicyExpr): expr is PolicyCondition {
  return (
    typeof expr === "object" &&
    expr != null &&
    "field" in expr &&
    "op" in expr &&
    "type" in expr
  );
}
