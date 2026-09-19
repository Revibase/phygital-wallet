import {
  getSolanaErrorFromTransactionError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  isSolanaError,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  PHYGITAL_WALLET_ERROR__MINT_NOT_ALLOWED,
  PHYGITAL_WALLET_ERROR__SPEND_LIMIT_EXCEEDED,
  PHYGITAL_WALLET_ERROR__WALLET_OWNER_MISMATCH,
} from "../generated/errors/phygitalWallet.js";
import {
  PolicyDeniedError,
  policyDeniedErrorFromSolanaError,
} from "./preview.js";

function customInstructionError(code: number) {
  return getSolanaErrorFromTransactionError({
    InstructionError: [0, { Custom: code }],
  });
}

describe("policyDeniedErrorFromSolanaError", () => {
  it("maps MintNotAllowed to a soft PolicyDeniedError", () => {
    const solanaError = customInstructionError(
      PHYGITAL_WALLET_ERROR__MINT_NOT_ALLOWED,
    );
    expect(
      isSolanaError(solanaError, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM),
    ).toBe(true);

    const denial = policyDeniedErrorFromSolanaError(solanaError);
    expect(denial).toBeInstanceOf(PolicyDeniedError);
    expect(denial?.code).toBe("mint_not_allowed");
    expect(denial?.soft).toBe(true);
  });

  it("maps SpendLimitExceeded to spend_limit", () => {
    const denial = policyDeniedErrorFromSolanaError(
      customInstructionError(PHYGITAL_WALLET_ERROR__SPEND_LIMIT_EXCEEDED),
    );
    expect(denial?.code).toBe("spend_limit");
    expect(denial?.soft).toBe(true);
  });

  it("ignores non-policy custom errors", () => {
    expect(
      policyDeniedErrorFromSolanaError(
        customInstructionError(PHYGITAL_WALLET_ERROR__WALLET_OWNER_MISMATCH),
      ),
    ).toBeNull();
  });

  it("ignores unrelated errors", () => {
    expect(policyDeniedErrorFromSolanaError(new Error("rpc down"))).toBeNull();
  });
});
