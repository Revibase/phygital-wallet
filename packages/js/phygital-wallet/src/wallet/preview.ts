import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";

import {
  PHYGITAL_WALLET_ERROR__INSTRUCTION_NOT_ALLOWED,
  PHYGITAL_WALLET_ERROR__MINT_NOT_ALLOWED,
  PHYGITAL_WALLET_ERROR__PROGRAM_NOT_ALLOWED,
  PHYGITAL_WALLET_ERROR__SPEND_LIMIT_EXCEEDED,
  type PhygitalWalletError,
} from "../generated/errors/phygitalWallet.js";

/** Policy denial from local policy simulation (or a fee-payer `/sign` response). */
export class PolicyDeniedError extends Error {
  readonly code: string;
  readonly soft: boolean;
  readonly intentHash?: string;
  readonly details?: Record<string, unknown>;

  constructor(args: {
    code: string;
    error: string;
    soft?: boolean;
    intentHash?: string;
    details?: Record<string, unknown>;
  }) {
    super(args.error);
    this.name = "PolicyDeniedError";
    this.code = args.code;
    this.soft = args.soft ?? false;
    this.intentHash = args.intentHash;
    this.details = args.details;
  }
}

/**
 * On-chain policy custom errors that an authority can bypass via
 * `executeWithAuthority`. Mapped to stable string codes for app UX.
 * Messages are inlined (Codama strips program error text in production).
 */
const POLICY_SOFT_DENY_BY_CODE: ReadonlyMap<
  PhygitalWalletError,
  { code: string; message: string }
> = new Map([
  [
    PHYGITAL_WALLET_ERROR__MINT_NOT_ALLOWED,
    {
      code: "mint_not_allowed",
      message: "Mint has no configured spend cap",
    },
  ],
  [
    PHYGITAL_WALLET_ERROR__SPEND_LIMIT_EXCEEDED,
    {
      code: "spend_limit",
      message: "Transfer exceeds the configured spending limit",
    },
  ],
  [
    PHYGITAL_WALLET_ERROR__PROGRAM_NOT_ALLOWED,
    {
      code: "program_not_allowed",
      message:
        "Passkey execute may only invoke allow-listed programs while a policy is active",
    },
  ],
  [
    PHYGITAL_WALLET_ERROR__INSTRUCTION_NOT_ALLOWED,
    {
      code: "instruction_not_allowed",
      message: "Instruction does not satisfy the configured program rules",
    },
  ],
]);

/**
 * If `error` is a policy soft-deny custom instruction error, return a
 * {@link PolicyDeniedError} the host can route to authority approval.
 * Otherwise return `null` (caller should rethrow the original error).
 */
export function policyDeniedErrorFromSolanaError(
  error: unknown,
): PolicyDeniedError | null {
  if (!isSolanaError(error, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
    return null;
  }
  const mapped = POLICY_SOFT_DENY_BY_CODE.get(
    error.context.code as PhygitalWalletError,
  );
  if (!mapped) return null;

  return new PolicyDeniedError({
    code: mapped.code,
    error: mapped.message,
    soft: true,
  });
}
