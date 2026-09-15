import { describe, expect, it } from "vitest";
import { resolveRpId } from "./constants.js";

describe("resolveRpId", () => {
  it("uses env override", () => {
    expect(resolveRpId("signer.revibase.com", "revibase.com")).toBe(
      "revibase.com",
    );
  });

  it("maps revibase subdomains to revibase.com", () => {
    expect(resolveRpId("app.revibase.com")).toBe("revibase.com");
    expect(resolveRpId("signer.revibase.com")).toBe("revibase.com");
  });

  it("uses localhost for local hosts", () => {
    expect(resolveRpId("localhost")).toBe("localhost");
    expect(resolveRpId("127.0.0.1")).toBe("localhost");
  });
});
