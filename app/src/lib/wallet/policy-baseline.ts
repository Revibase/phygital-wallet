import {
  ASSOCIATED_TOKEN_PROGRAM,
  CLASSIC_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
} from "@/lib/tokens/payment-token";

/**
 * Built-in accessory allow-list when a policy is active and a program has no
 * explicit override. Shown as the Allowed matrix on the permissions status
 * screen so a Solana-aware user can scan what’s executable in one glance.
 */
export const POLICY_BASELINE_CAPABILITIES = [
  {
    id: "sol",
    label: "Send SOL",
    program: "System Program",
    programIds: [String(SYSTEM_PROGRAM)],
  },
  {
    id: "tokens",
    label: "Transfer tokens",
    program: "Token · Token-2022",
    programIds: [String(CLASSIC_TOKEN_PROGRAM), String(TOKEN_2022_PROGRAM)],
  },
  {
    id: "ata",
    label: "Create ATAs",
    program: "Associated Token",
    programIds: [String(ASSOCIATED_TOKEN_PROGRAM)],
  },
] as const;

const KNOWN_PROGRAM_LABELS: Record<string, string> = {
  [String(SYSTEM_PROGRAM)]: "System Program",
  [String(CLASSIC_TOKEN_PROGRAM)]: "Token Program",
  [String(TOKEN_2022_PROGRAM)]: "Token-2022",
  [String(ASSOCIATED_TOKEN_PROGRAM)]: "Associated Token",
};

/** Friendly name for common Solana program IDs; falls back to a short address. */
export function labelProgramId(
  programId: string,
  shortAddress: (id: string, chars?: number) => string,
): string {
  return KNOWN_PROGRAM_LABELS[programId] ?? shortAddress(programId, 4);
}
