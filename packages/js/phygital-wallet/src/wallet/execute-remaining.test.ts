import { describe, expect, it } from "vitest";
import { PhygitalWalletInstruction } from "../generated/programs/index.js";
import {
  EXECUTE_NAMED_ACCOUNT_COUNT,
  EXECUTE_WITH_AUTHORITY_NAMED_ACCOUNT_COUNT,
  executeRemainingAccountOffset,
  sliceExecuteRemainingAccounts,
} from "./execute-remaining.js";

describe("execute remaining account offsets", () => {
  it("matches Codama named-account layouts", () => {
    expect(EXECUTE_NAMED_ACCOUNT_COUNT).toBe(6);
    expect(EXECUTE_WITH_AUTHORITY_NAMED_ACCOUNT_COUNT).toBe(5);
    expect(
      executeRemainingAccountOffset(PhygitalWalletInstruction.Execute),
    ).toBe(6);
    expect(
      executeRemainingAccountOffset(
        PhygitalWalletInstruction.ExecuteWithAuthority,
      ),
    ).toBe(5);
    expect(
      executeRemainingAccountOffset(
        PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies,
      ),
    ).toBe(5);
    expect(
      executeRemainingAccountOffset(PhygitalWalletInstruction.SetAuthority),
    ).toBeNull();
  });

  it("slices remaining after the named accounts", () => {
    const accounts = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(
      sliceExecuteRemainingAccounts(
        PhygitalWalletInstruction.Execute,
        accounts,
      ),
    ).toEqual(["g", "h"]);
    expect(
      sliceExecuteRemainingAccounts(
        PhygitalWalletInstruction.ExecuteWithAuthority,
        accounts,
      ),
    ).toEqual(["f", "g", "h"]);
  });
});
