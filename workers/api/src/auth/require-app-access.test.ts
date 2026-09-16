import { describe, expect, it } from "vitest";

import {
  evaluateAppAccess,
  isOpenCorsPath,
  isPublicApiPath,
  normalizeApiPath,
} from "./require-app-access";

describe("API access", () => {
  it("normalizes paths", () => {
    expect(normalizeApiPath("/health/?x=1")).toBe("/health");
  });

  it("keeps fee-payer routes public", () => {
    expect(isPublicApiPath("GET", "/getFeePayer")).toBe(true);
    expect(isPublicApiPath("POST", "/sign")).toBe(true);
    expect(isPublicApiPath("GET", "/health")).toBe(true);
    expect(isPublicApiPath("GET", "/owner-wallet/blob")).toBe(true);
    expect(isPublicApiPath("POST", "/owner-wallet/blob/challenge")).toBe(true);
    expect(isPublicApiPath("PUT", "/owner-wallet/blob")).toBe(true);
    expect(isPublicApiPath("GET", "/tokens/verified")).toBe(false);
  });

  it("opens CORS only for fee-payer routes", () => {
    expect(isOpenCorsPath("GET", "/getFeePayer")).toBe(true);
    expect(isOpenCorsPath("POST", "/sign")).toBe(true);
    expect(isOpenCorsPath("GET", "/tokens/verified")).toBe(false);
  });

  it("requires browse unlock on protected routes", () => {
    expect(evaluateAppAccess({ method: "GET", path: "/tokens/verified", browseToken: null })).toBe("deny");
    expect(evaluateAppAccess({ method: "GET", path: "/tokens/verified", browseToken: "TokA" })).toBe("allow");
  });

  it("scopes token routes to the unlocked accessory", () => {
    expect(evaluateAppAccess({ method: "GET", path: "/tokens/fee-balance", queryToken: "TokB", browseToken: "TokA" })).toBe("deny_token_mismatch");
    expect(evaluateAppAccess({ method: "GET", path: "/tokens/fee-balance", queryToken: "TokA", browseToken: "TokA" })).toBe("allow");
  });
});
