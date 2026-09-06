import { describe, expect, it, vi } from "vitest";

/**
 * Mirrors `workers/api/src/auth/unlink-owner.ts` — owner unlink must reset
 * standing policy only after the device link is deleted.
 */
async function unlinkOwnerAndResetPolicy(args: {
  deleteLink: () => Promise<boolean>;
  deletePolicy: () => Promise<void>;
}): Promise<boolean> {
  const ok = await args.deleteLink();
  if (!ok) return false;
  await args.deletePolicy();
  return true;
}

describe("unlinkOwnerAndResetPolicy", () => {
  it("resets policy only after a successful link delete", async () => {
    const deletePolicy = vi.fn(async () => undefined);
    const ok = await unlinkOwnerAndResetPolicy({
      deleteLink: async () => true,
      deletePolicy,
    });
    expect(ok).toBe(true);
    expect(deletePolicy).toHaveBeenCalledOnce();
  });

  it("skips policy reset when the link was not owned here", async () => {
    const deletePolicy = vi.fn(async () => undefined);
    const ok = await unlinkOwnerAndResetPolicy({
      deleteLink: async () => false,
      deletePolicy,
    });
    expect(ok).toBe(false);
    expect(deletePolicy).not.toHaveBeenCalled();
  });
});
