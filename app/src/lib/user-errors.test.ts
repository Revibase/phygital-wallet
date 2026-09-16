import { describe, expect, it } from "vitest";

import { toUserFacingError, toUserErrorMessage } from "./user-errors";
import { errorCopy } from "@/lib/copy/phygital";
import { SecureSignerError } from "@/lib/wallet/secure-signer-client";

describe("toUserFacingError", () => {
  it("names insufficient balance", () => {
    const facing = toUserFacingError(
      new Error("They don't have enough balance for this payment.")
    );
    expect(facing.title).toBe(errorCopy.notEnoughMoney.title);
    expect(facing.body).toMatch(/enough/i);
  });

  it("maps on-chain insufficient funds, including simulation logs", () => {
    const sim = toUserFacingError(
      new Error(
        "Transaction would fail on-chain:\nProgram log: Error: insufficient funds"
      )
    );
    expect(sim.title).toBe(errorCopy.notEnoughMoney.title);
  });

  it("maps a passkey mismatch to Wrong item", () => {
    expect(
      toUserErrorMessage(new Error("This is not the same NFC accessory."))
    ).toBe(errorCopy.wrongItem.title);
  });

  it("maps an unverified live check", () => {
    const facing = toUserFacingError(
      new Error("Couldn't verify this NFC accessory.")
    );
    expect(facing.title).toBe(errorCopy.nfcVerifyFailed.title);
  });

  it("maps amount precision", () => {
    const facing = toUserFacingError(
      new Error("Amount supports at most 6 decimals")
    );
    expect(facing.title).toBe(errorCopy.amountTooPrecise.title);
  });

  it("does not surface Safari codec ReferenceErrors as friendly copy", () => {
    expect(
      toUserErrorMessage(new Error("Can't find variable: alphabet4")),
    ).toBe(errorCopy.fallback.body);
  });

  it("maps TokenIsCurrentlyUnLocked to hold-required copy", () => {
    expect(
      toUserErrorMessage(
        new Error("Token must be lockable and currently locked"),
      ),
    ).toBe(errorCopy.accessoryNeedsHold.title);
  });

  it("maps SecureSigner INVALID_WALLET_BLOB to re-login copy", () => {
    expect(
      toUserErrorMessage(new SecureSignerError("INVALID_WALLET_BLOB")),
    ).toBe(errorCopy.signerNeedsRelogin.body);
  });
});
