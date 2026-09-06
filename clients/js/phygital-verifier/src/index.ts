/**
 * Public API for `phygital-verifier-sdk`.
 *
 * Mental model (read this first):
 * 1. **Parsers** decode instruction bytes → named fields (`amount`, `mint`, …)
 * 2. **Policies** say which programs/instructions/conditions are allowed (JSON-safe)
 * 3. **`createVerifier({ parsers })`** checks a tx’s instructions against a policy
 *
 * Source layout:
 * - `core/`     — types, verify engine, policy builders
 * - `policy/`   — ready-made STANDARD policy preset
 * - `parsers/`  — STANDARD program parsers + IDL glue
 */
export {
  RECIPIENT_ACCOUNT_FIELDS,
} from "./core/constants.js";

export type {
  AggregateField,
  AggregateOp,
  ConditionOp,
  FieldSchemaEntry,
  FieldType,
  FieldValue,
  Instruction,
  InstructionAllow,
  InstructionDeny,
  ParsedIx,
  PolicyCondition,
  PolicyDocument,
  PolicyExpr,
  ProgramParser,
  ProgramPolicy,
  TransactionAggregate,
  TransactionConstraints,
  VerifyFail,
  VerifyFailDetails,
  VerifyOk,
  VerifyResult,
} from "./core/types.js";

export { isPolicyCondition } from "./core/types.js";

export {
  createVerifier,
  validatePolicy,
  type CreateVerifierOptions,
} from "./core/verify.js";

export type {
  FieldLayout,
  FixedDataType,
  InstructionLayout,
  ProgramLayouts,
} from "./core/layout.js";

export {
  STANDARD_PROGRAM_LAYOUTS,
  indexProgramLayouts,
  matchLayoutByDisc,
} from "./parsers/layouts.js";

export {
  defineProgram,
  definePolicy,
  type DefineProgramOptions,
} from "./core/policy-builder.js";

export {
  COLLECTIBLE_COMPANION_PROGRAMS,
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  defineStandardPolicy,
  standardPolicy,
  standardTransaction,
  uiAmountToRaw,
  type StandardPolicyOptions,
} from "./policy/standard.js";

export {
  STANDARD_PARSERS,
  ataParser,
  bubblegumParser,
  coreParser,
  systemParser,
  token2022Parser,
  tokenMetadataParser,
  tokenParser,
} from "./parsers/index.js";

export { fromGenerated } from "./parsers/from-generated.js";
