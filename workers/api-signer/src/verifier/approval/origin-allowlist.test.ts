import { describe, expect, it } from "vitest";
import { checkOriginAllowed } from "./origin-allowlist.js";

const ALLOW = {
  version: "3" as const,
  allowedOrigins: ["https://a.example.com", "https://shop.example.com:8443"],
};

describe("checkOriginAllowed", () => {
  it("allows any origin when no policy is set", () => {
    expect(checkOriginAllowed(null, "https://anything.com").ok).toBe(true);
    expect(checkOriginAllowed(null, null).ok).toBe(true);
  });

  it("allows any origin when the allowlist is absent or empty", () => {
    expect(checkOriginAllowed({ version: "3" }, "https://x.com").ok).toBe(true);
    expect(
      checkOriginAllowed({ version: "3", allowedOrigins: [] }, null).ok,
    ).toBe(true);
  });

  it("allows a listed origin (including non-default port)", () => {
    expect(checkOriginAllowed(ALLOW, "https://a.example.com").ok).toBe(true);
    expect(checkOriginAllowed(ALLOW, "https://shop.example.com:8443").ok).toBe(
      true,
    );
  });

  it("denies an unlisted origin", () => {
    const v = checkOriginAllowed(ALLOW, "https://evil.example.com");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("origin_not_allowed");
    expect(v.origin).toBe("https://evil.example.com");
  });

  it("denies a null (server) origin when an allowlist exists", () => {
    const v = checkOriginAllowed(ALLOW, null);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("origin_not_allowed");
    expect(v.origin).toBeNull();
  });

  it("is exact — a port or scheme difference is not a match", () => {
    expect(checkOriginAllowed(ALLOW, "http://a.example.com").ok).toBe(false);
    expect(checkOriginAllowed(ALLOW, "https://a.example.com:8443").ok).toBe(
      false,
    );
  });
});
