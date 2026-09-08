import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy-engine.js";

describe("evaluatePolicy", () => {
  it("allows when policy is null (opt-in off)", () => {
    const r = evaluatePolicy(null, [
      {
        programAddress: "11111111111111111111111111111111" as never,
        data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0]),
        accounts: [],
      },
    ]);
    expect(r.ok).toBe(true);
  });

  it("builds payments policy for version 3 config", () => {
    const r = evaluatePolicy(
      { version: "3" },
      [
        {
          programAddress: "ComputeBudget111111111111111111111111111111" as never,
          data: new Uint8Array([2]),
        },
      ],
    );
    // Only compute budget → unexpected after strip
    expect(r.ok).toBe(false);
  });
});
