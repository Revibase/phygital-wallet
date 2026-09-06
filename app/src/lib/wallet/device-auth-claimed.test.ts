import { beforeEach, describe, expect, it, vi } from "vitest";

const queryFetch = vi.fn();
const readJson = vi.fn();

vi.mock("@/lib/queries/http", () => ({
  queryFetch: (...args: unknown[]) => queryFetch(...args),
  readJson: (...args: unknown[]) => readJson(...args),
  QueryHttpError: class QueryHttpError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

describe("fetchTokenClaimed", () => {
  beforeEach(() => {
    queryFetch.mockReset();
    readJson.mockReset();
  });

  it("GETs the public claimed endpoint and returns the flag", async () => {
    const { fetchTokenClaimed } = await import("./device-auth-client");
    const res = new Response();
    queryFetch.mockResolvedValue(res);
    readJson.mockResolvedValue({ claimed: true });

    await expect(
      fetchTokenClaimed("TokenPda111111111111111111111111111111111"),
    ).resolves.toBe(true);

    expect(queryFetch).toHaveBeenCalledWith(
      "/auth/device/links/claimed?phygitalToken=TokenPda111111111111111111111111111111111",
    );
    expect(readJson).toHaveBeenCalledWith(res, "Couldn’t check claim status");
  });
});
