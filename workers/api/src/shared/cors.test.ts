import { describe, expect, it } from "vitest";

import { corsModeForRequest, isAppBrowserOrigin } from "./cors";

describe("isAppBrowserOrigin", () => {
  it("allows revibase and localhost", () => {
    expect(isAppBrowserOrigin("https://p.revibase.com")).toBe(true);
    expect(isAppBrowserOrigin("https://revibase.com")).toBe(true);
    expect(isAppBrowserOrigin("http://localhost:3000")).toBe(true);
    expect(isAppBrowserOrigin("https://evil.example")).toBe(false);
  });
});

describe("corsModeForRequest", () => {
  it("uses credentialed CORS for app origins on open paths", () => {
    expect(
      corsModeForRequest("POST", "/preview", "https://p.revibase.com"),
    ).toBe("credentialed");
  });

  it("uses open CORS for third-party origins on open paths", () => {
    expect(
      corsModeForRequest("POST", "/preview", "https://dapp.example"),
    ).toBe("open");
    expect(
      corsModeForRequest("POST", "/sign", "https://dapp.example"),
    ).toBe("open");
  });

  it("keeps credentialed CORS for protected app paths", () => {
    expect(
      corsModeForRequest("GET", "/tokens/verified", "https://p.revibase.com"),
    ).toBe("credentialed");
  });

  it("defaults open paths without Origin to credentialed (server clients)", () => {
    expect(corsModeForRequest("POST", "/sign", undefined)).toBe("credentialed");
  });
});
