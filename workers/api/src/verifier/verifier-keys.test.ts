import { describe, expect, it, vi, beforeEach } from "vitest";

// The chip-identifier → token mapping is resolved via an on-chain program scan
// (getProgramAccounts), which is the most expensive call on /connect/tap. The
// cache must turn repeat taps of the same chip into a single scan per isolate.
const fetchByIdentifier = vi.fn();
vi.mock("phygital-token-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("phygital-token-sdk")>()),
  fetchPhygitalTokenByIdentifier: (...args: unknown[]) => fetchByIdentifier(...args),
  findPhygitalTokenPda: async (pk: string) => `token-for-${pk}`,
}));

import { resolveTokenFromIdentifier } from "./verifier-keys";

const rpc = {} as never;

describe("resolveTokenFromIdentifier", () => {
  beforeEach(() => fetchByIdentifier.mockReset());

  it("scans once per chip, then serves cached", async () => {
    fetchByIdentifier.mockResolvedValue({ publicKey: "pk-AAA" });

    const a = await resolveTokenFromIdentifier(rpc, "chip-AAA");
    const b = await resolveTokenFromIdentifier(rpc, "chip-AAA");
    const c = await resolveTokenFromIdentifier(rpc, "chip-AAA");

    expect(a).toBe("token-for-pk-AAA");
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Only the first call hit the chain.
    expect(fetchByIdentifier).toHaveBeenCalledTimes(1);
  });

  it("does not cache a miss (lets a later mint populate it)", async () => {
    fetchByIdentifier.mockResolvedValueOnce(null);
    expect(await resolveTokenFromIdentifier(rpc, "chip-NEW")).toBeNull();

    fetchByIdentifier.mockResolvedValueOnce({ publicKey: "pk-NEW" });
    expect(await resolveTokenFromIdentifier(rpc, "chip-NEW")).toBe(
      "token-for-pk-NEW",
    );
    expect(fetchByIdentifier).toHaveBeenCalledTimes(2);
  });
});
