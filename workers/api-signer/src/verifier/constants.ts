/**
 * Program IDs used by the Revibase co-signer (preview / sign / fees).
 */

/** Well-known Solana Compute Budget program (wallet injects at send). */
export const COMPUTE_BUDGET_PROGRAM =
  "ComputeBudget111111111111111111111111111111" as const;

export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as const;

/** Native secp256r1 precompile. */
export const SECP256R1_PROGRAM =
  "Secp256r1SigVerify1111111111111111111111111" as const;
