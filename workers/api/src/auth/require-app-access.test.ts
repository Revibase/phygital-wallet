import { describe, expect, it } from "vitest";

import {
  extractPhygitalTokenFromRequest,
  evaluateAppAccess,
  isOpenCorsPath,
  isPublicApiPath,
  normalizeApiPath,
} from "./require-app-access";

describe("normalizeApiPath", () => {
  it("strips trailing slash and query", () => {
    expect(normalizeApiPath("/preview/")).toBe("/preview");
    expect(normalizeApiPath("/health?x=1")).toBe("/health");
  });
});

describe("isPublicApiPath", () => {
  it("allows verifier and bootstrap routes", () => {
    expect(isPublicApiPath("POST", "/preview")).toBe(true);
    expect(isPublicApiPath("POST", "/sign")).toBe(true);
    expect(isPublicApiPath("POST", "/connect")).toBe(true);
    expect(isPublicApiPath("POST", "/connect/tap")).toBe(true);
    expect(isPublicApiPath("GET", "/health")).toBe(true);
    // The removed `/verify-tap` route is not public.
    expect(isPublicApiPath("GET", "/verify-tap")).toBe(false);
    expect(isPublicApiPath("POST", "/auth/app-session")).toBe(true);
    expect(isPublicApiPath("GET", "/auth/device/register-options")).toBe(true);
    expect(isPublicApiPath("POST", "/auth/device")).toBe(true);
    expect(isPublicApiPath("GET", "/auth/device-session/options")).toBe(true);
    expect(isPublicApiPath("POST", "/auth/device-session")).toBe(true);
    expect(isPublicApiPath("POST", "/auth/device-session/refresh")).toBe(true);
    expect(isPublicApiPath("GET", "/auth/device-session")).toBe(true);
    expect(isPublicApiPath("POST", "/webhooks/helius")).toBe(true);
    expect(isPublicApiPath("GET", "/auth/device/gate")).toBe(true);
  });

  it("rejects protected routes", () => {
    expect(isPublicApiPath("GET", "/tokens/verified")).toBe(false);
    expect(isPublicApiPath("GET", "/tokens/fee-balance")).toBe(false);
    expect(isPublicApiPath("GET", "/auth/app-session")).toBe(false);
    expect(isPublicApiPath("DELETE", "/auth/app-session")).toBe(false);
    expect(isPublicApiPath("POST", "/auth/app-session")).toBe(true);
    expect(isPublicApiPath("GET", "/auth/device/links/claimed")).toBe(false);
    expect(isPublicApiPath("GET", "/policies/Tok/approvals")).toBe(false);
    expect(isPublicApiPath("POST", "/policies/Tok/approvals/deny")).toBe(false);
    expect(isPublicApiPath("GET", "/preview")).toBe(false);
    expect(isPublicApiPath("POST", "/auth/device/links")).toBe(false);
    expect(isPublicApiPath("GET", "/approvals/live")).toBe(false);
    expect(isPublicApiPath("POST", "/policies/Tok/approvals/cancel")).toBe(
      false,
    );
  });
});

describe("isOpenCorsPath", () => {
  it("opens verifier paths only", () => {
    expect(isOpenCorsPath("POST", "/preview")).toBe(true);
    expect(isOpenCorsPath("POST", "/sign")).toBe(true);
    expect(isOpenCorsPath("GET", "/approvals/live")).toBe(false);
    expect(isOpenCorsPath("POST", "/policies/Tok/approvals/cancel")).toBe(
      false,
    );
    expect(isOpenCorsPath("GET", "/health")).toBe(false);
    expect(isOpenCorsPath("GET", "/tokens/verified")).toBe(false);
  });
});

describe("extractPhygitalTokenFromRequest", () => {
  it("prefers query param", () => {
    expect(
      extractPhygitalTokenFromRequest("/tokens/fee-balance", "QueryTok"),
    ).toBe("QueryTok");
  });

  it("parses policies and link mutation paths", () => {
    expect(
      extractPhygitalTokenFromRequest("/policies/TokAbc/approvals", undefined),
    ).toBe("TokAbc");
    expect(
      extractPhygitalTokenFromRequest(
        "/auth/device/links/TokAbc/mutation-options",
        undefined,
      ),
    ).toBe("TokAbc");
    expect(
      extractPhygitalTokenFromRequest("/auth/device/links/TokAbc", undefined),
    ).toBe("TokAbc");
  });

  it("does not treat status as a token", () => {
    expect(
      extractPhygitalTokenFromRequest("/auth/device/links/status", undefined),
    ).toBeNull();
  });
});

describe("evaluateAppAccess", () => {
  it("allows public paths without cookies", () => {
    expect(
      evaluateAppAccess({
        method: "POST",
        path: "/preview",
        hasDeviceSession: false,
        browseToken: null,
      }),
    ).toBe("allow");
  });

  it("allows device session on protected paths", () => {
    expect(
      evaluateAppAccess({
        method: "GET",
        path: "/tokens/verified",
        hasDeviceSession: true,
        browseToken: null,
      }),
    ).toBe("allow");
  });

  it("allows matching browse-unlock", () => {
    expect(
      evaluateAppAccess({
        method: "GET",
        path: "/tokens/fee-balance",
        queryToken: "TokA",
        hasDeviceSession: false,
        browseToken: "TokA",
      }),
    ).toBe("allow");
  });

  it("denies missing cookies on protected paths", () => {
    expect(
      evaluateAppAccess({
        method: "GET",
        path: "/tokens/verified",
        hasDeviceSession: false,
        browseToken: null,
      }),
    ).toBe("deny");
  });

  it("denies browse-unlock for a different token", () => {
    expect(
      evaluateAppAccess({
        method: "GET",
        path: "/policies/TokB/approvals",
        hasDeviceSession: false,
        browseToken: "TokA",
      }),
    ).toBe("deny_token_mismatch");
  });

  it("allows any browse-unlock when request has no token", () => {
    expect(
      evaluateAppAccess({
        method: "GET",
        path: "/tokens/verified",
        hasDeviceSession: false,
        browseToken: "TokA",
      }),
    ).toBe("allow");
  });
});
