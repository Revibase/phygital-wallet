/**
 * Program IDs used by the Revibase co-signer (preview / sign / fees).
 */
import { SYSTEM_PROGRAM_ADDRESS } from "phygital-policy";

/** Well-known Solana Compute Budget program (wallet injects at send). */
export const COMPUTE_BUDGET_PROGRAM =
  "ComputeBudget111111111111111111111111111111" as const;

export const SYSTEM_PROGRAM = SYSTEM_PROGRAM_ADDRESS;

/** Native secp256r1 precompile. */
export const SECP256R1_PROGRAM =
  "Secp256r1SigVerify1111111111111111111111111" as const;
