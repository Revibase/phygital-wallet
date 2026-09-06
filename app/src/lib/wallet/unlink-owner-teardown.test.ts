/**
 * Production unlink order:
 * 1) On-chain teardown (token verifier + recovery wallet PDAs closed)
 * 2) DO removeOwnerAndClear (WebAuthn)
 * 3) D1 link delete
 */
async function unlinkOwnerAfterTeardown(args: {
  assertOnChainClear: () => Promise<boolean>;
  clearOnDo: () => Promise<boolean>;
  deleteLink: () => Promise<void>;
}): Promise<boolean> {
  if (!(await args.assertOnChainClear())) return false;
  const ok = await args.clearOnDo();
  if (!ok) return false;
  await args.deleteLink();
  return true;
}

import { describe, expect, it, vi } from "vitest";

describe("unlinkOwnerAfterTeardown", () => {
  it("deletes link only after on-chain clear and DO clear succeed", async () => {
    const deleteLink = vi.fn(async () => undefined);
    const ok = await unlinkOwnerAfterTeardown({
      assertOnChainClear: async () => true,
      clearOnDo: async () => true,
      deleteLink,
    });
    expect(ok).toBe(true);
    expect(deleteLink).toHaveBeenCalledOnce();
  });

  it("skips DO clear and link delete when on-chain teardown is incomplete", async () => {
    const clearOnDo = vi.fn(async () => true);
    const deleteLink = vi.fn(async () => undefined);
    const ok = await unlinkOwnerAfterTeardown({
      assertOnChainClear: async () => false,
      clearOnDo,
      deleteLink,
    });
    expect(ok).toBe(false);
    expect(clearOnDo).not.toHaveBeenCalled();
    expect(deleteLink).not.toHaveBeenCalled();
  });

  it("skips link delete when DO clear fails", async () => {
    const deleteLink = vi.fn(async () => undefined);
    const ok = await unlinkOwnerAfterTeardown({
      assertOnChainClear: async () => true,
      clearOnDo: async () => false,
      deleteLink,
    });
    expect(ok).toBe(false);
    expect(deleteLink).not.toHaveBeenCalled();
  });
});
