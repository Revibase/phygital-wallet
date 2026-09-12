import { describe, expect, it } from "vitest";
import { validatePaymentsPolicyConfig } from "./payments-policy-config.js";

describe("validatePaymentsPolicyConfig — allowedOrigins", () => {
  it("normalizes, dedupes and sorts allowed origins", () => {
    const r = validatePaymentsPolicyConfig({
      version: "3",
      allowedOrigins: [
        "https://b.example.com/some/path?q=1",
        "https://a.example.com",
        "https://a.example.com", // duplicate
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.allowedOrigins).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("preserves non-default ports and drops unparseable entries", () => {
    const r = validatePaymentsPolicyConfig({
      version: "3",
      allowedOrigins: ["https://shop.example.com:8443", "not a url", "", 42],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.allowedOrigins).toEqual(["https://shop.example.com:8443"]);
  });

  it("omits the field entirely when nothing normalizes", () => {
    const r = validatePaymentsPolicyConfig({
      version: "3",
      allowedOrigins: ["", "nope"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("allowedOrigins" in r.config).toBe(false);
  });

  it("omits the field when the key is absent", () => {
    const r = validatePaymentsPolicyConfig({ version: "3" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("allowedOrigins" in r.config).toBe(false);
  });

  it("rejects a non-array allowedOrigins", () => {
    const r = validatePaymentsPolicyConfig({
      version: "3",
      allowedOrigins: "https://example.com",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_policy");
  });
});
