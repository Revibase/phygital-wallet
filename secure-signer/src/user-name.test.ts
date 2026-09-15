import { describe, expect, it } from "vitest";
import { validateUserName } from "./user-name.js";

describe("validateUserName", () => {
  it("accepts a simple handle", () => {
    expect(validateUserName("  alice  ")).toEqual({
      ok: true,
      userName: "alice",
    });
  });

  it("rejects short, long, and illegal characters", () => {
    expect(validateUserName("ab").ok).toBe(false);
    expect(validateUserName("a".repeat(33)).ok).toBe(false);
    expect(validateUserName("bad name").ok).toBe(false);
    expect(validateUserName("evil<script>").ok).toBe(false);
  });
});
