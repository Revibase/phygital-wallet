/**
 * Public API for `phygital-verifier-sdk`.
 *
 * Mental model:
 * 1. Wrap Codama `identify*` / `parse*` with `fromCodamaProgram`
 * 2. Compose `allow` / `deny` / `allowProgram` / `aggregate` rules
 * 3. `policy(rules).verify(instructions)`
 */
export type {
  VerifyFail,
  VerifyFailDetails,
  VerifyOk,
  VerifyResult,
} from "./core/types.js";
export { fail, ok } from "./core/types.js";

export type {
  AddressLike,
  CodamaProgram,
  FromCodamaProgramOptions,
  InstructionMatcher,
  ParsedProgramIx,
  ProgramAdapter,
} from "./core/adapter.js";
export { addressString, fromCodamaProgram } from "./core/adapter.js";

export type {
  AggregateRule,
  AggregateSource,
  AllowProgramRule,
  AllowRule,
  DenyProgramRule,
  DenyRule,
  Policy,
  Rule,
} from "./core/policy.js";
export {
  aggregate,
  allow,
  allowProgram,
  deny,
  denyProgram,
  policy,
} from "./core/policy.js";
