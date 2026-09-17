import { describe, expect, it } from "vitest";

import { corsModeForRequest, isAppBrowserOrigin } from "./cors";

describe("isAppBrowserOrigin", () => {
  it("allows app, signer, and localhost only", () => {
    expect(isAppBrowserOrigin("https://app.revibase.com")).toBe(true);
    expect(isAppBrowserOrigin("https://signer.revibase.com")).toBe(true);
    expect(isAppBrowserOrigin("http://localhost:3000")).toBe(true);
    expect(isAppBrowserOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("rejects sibling and foreign hosts", () => {
    expect(isAppBrowserOrigin("https://evil.revibase.com")).toBe(false);
    expect(isAppBrowserOrigin("https://p.revibase.com")).toBe(false);
    expect(isAppBrowserOrigin("https://revibase.com")).toBe(false);
    expect(isAppBrowserOrigin("https://evil.example")).toBe(false);
  });
});

describe("corsModeForRequest", () => {
  it("uses credentialed CORS for app origins on open paths", () => {
    expect(
      corsModeForRequest("GET", "/getFeePayer", "https://app.revibase.com"),
    ).toBe("credentialed");
  });

  it("uses open CORS for third-party origins on open paths", () => {
    expect(corsModeForRequest("GET", "/getFeePayer", "https://dapp.example")).toBe(
      "open",
    );
    expect(corsModeForRequest("POST", "/sign", "https://dapp.example")).toBe(
      "open",
    );
  });

  it("keeps credentialed CORS for protected app paths", () => {
    expect(
      corsModeForRequest("GET", "/tokens/verified", "https://app.revibase.com"),
    ).toBe("credentialed");
  });

  it("defaults open paths without Origin to credentialed (server clients)", () => {
    expect(corsModeForRequest("POST", "/sign", undefined)).toBe("credentialed");
  });
});
