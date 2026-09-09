import { describe, expect, it } from "vitest";

import { parseUsername } from "./username";

describe("parseUsername", () => {
  it("normalizes id and preserves display casing", () => {
    expect(parseUsername("Revibase_User")).toEqual({
      id: "revibase_user",
      display: "Revibase_User",
    });
  });

  it("rejects invalid usernames", () => {
    expect(parseUsername("")).toBeNull();
    expect(parseUsername("no")).toBeNull();
    expect(parseUsername("has.dot")).toBeNull();
  });
});
