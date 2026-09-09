import { describe, expect, it } from "vitest";

import { formatHandle, parseUsername, usernameHint } from "./username";

describe("parseUsername", () => {
  it("accepts Twitter-style names and strips @", () => {
    expect(parseUsername("@Alice_01")).toEqual({
      id: "alice_01",
      display: "Alice_01",
    });
  });

  it("rejects short, long, or invalid characters", () => {
    expect(parseUsername("abc")).toBeNull();
    expect(parseUsername("a".repeat(16))).toBeNull();
    expect(parseUsername("bad-name")).toBeNull();
    expect(parseUsername("has space")).toBeNull();
  });
});

describe("usernameHint", () => {
  it("explains common problems", () => {
    expect(usernameHint("ab")).toMatch(/4/);
    expect(usernameHint("a".repeat(16))).toMatch(/15/);
    expect(usernameHint("bad-name")).toMatch(/Letters/);
    expect(usernameHint("good_name")).toBeNull();
  });
});

describe("formatHandle", () => {
  it("prefixes @", () => {
    expect(formatHandle("alice_01")).toBe("@alice_01");
    expect(formatHandle("@Alice")).toBe("@Alice");
  });
});
