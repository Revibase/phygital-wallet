import { describe, expect, it, vi, afterEach } from "vitest";

import {
  QueryHttpError,
  isRetryableQueryError,
  queryFetch,
  readJson,
  shouldRetryQuery,
} from "./http";

describe("QueryHttpError / retry policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readJson throws QueryHttpError with status", async () => {
    const res = new Response(JSON.stringify({ error: "already used" }), {
      status: 409,
    });
    await expect(readJson(res, "fallback")).rejects.toMatchObject({
      name: "QueryHttpError",
      status: 409,
      message: "already used",
    });
  });

  it("does not retry 4xx business errors", () => {
    expect(isRetryableQueryError(new QueryHttpError("used", 409))).toBe(false);
    expect(isRetryableQueryError(new QueryHttpError("bad", 400))).toBe(false);
    expect(shouldRetryQuery(0, new QueryHttpError("used", 409))).toBe(false);
  });

  it("retries 408 / 429 / 5xx", () => {
    expect(isRetryableQueryError(new QueryHttpError("to", 408))).toBe(true);
    expect(isRetryableQueryError(new QueryHttpError("rate", 429))).toBe(true);
    expect(isRetryableQueryError(new QueryHttpError("boom", 503))).toBe(true);
    expect(shouldRetryQuery(2, new QueryHttpError("boom", 503))).toBe(true);
    expect(shouldRetryQuery(3, new QueryHttpError("boom", 503))).toBe(false);
  });

  it("retries network TypeError, not AbortError", () => {
    expect(isRetryableQueryError(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isRetryableQueryError(
        new DOMException("The operation was aborted", "AbortError")
      )
    ).toBe(false);
    expect(isRetryableQueryError(new Error("wallet required"))).toBe(false);
  });

  it("queryFetch still forces cache: no-store", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await queryFetch("/tokens/verified", { cache: "force-cache" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/tokens/verified",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
