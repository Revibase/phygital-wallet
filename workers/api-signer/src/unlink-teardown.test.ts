import { describe, expect, it } from "vitest";

import { unlinkTeardownFromPresence } from "@/unlink-teardown";

describe("unlinkTeardownFromPresence", () => {
  it("allows unlink when both PDAs are absent", () => {
    expect(
      unlinkTeardownFromPresence({
        recoveryWallet: false,
        tokenVerifier: false,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks when recovery wallet remains", () => {
    const result = unlinkTeardownFromPresence({
      recoveryWallet: true,
      tokenVerifier: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("teardown_required");
    expect(result.details).toEqual({
      recoveryWallet: true,
      tokenVerifier: false,
    });
    expect(result.error).toMatch(/recovery wallet/i);
  });

  it("blocks when token verifier remains", () => {
    const result = unlinkTeardownFromPresence({
      recoveryWallet: false,
      tokenVerifier: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.tokenVerifier).toBe(true);
    expect(result.error).toMatch(/signing verifier/i);
  });
});
