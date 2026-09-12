import { describe, expect, it } from "vitest";

import { TokenStore } from "@/token-store";

/**
 * Minimal in-memory stand-in covering only the two `accessory_counter`
 * statements, so this test exercises the real monotonicity logic rather than a
 * mock of it. Keyed by (kind, identifier) exactly like the real primary key.
 */
function accessoryCounterSql() {
  const rows = new Map<string, { c: number; updated_at: number }>();
  const key = (kind: unknown, id: unknown) =>
    `${String(kind)}\u0000${String(id)}`;

  const exec = (query: string, ...params: unknown[]) => {
    const q = query.replace(/\s+/g, " ").trim();

    if (q.startsWith("SELECT c FROM accessory_counter")) {
      const row = rows.get(key(params[0], params[1]));
      return { toArray: () => (row ? [{ c: row.c }] : []) };
    }

    if (q.startsWith("INSERT INTO accessory_counter")) {
      rows.set(key(params[0], params[1]), {
        c: Number(params[2]),
        updated_at: Number(params[3]),
      });
      return { toArray: () => [] };
    }

    throw new Error(`unexpected query: ${q}`);
  };

  return { sql: { exec } as never, rows };
}

function store() {
  const { sql, rows } = accessoryCounterSql();
  return { store: new TokenStore(sql, "token-1"), rows };
}

const CHIP = "chip-identifier-a";
const rowKey = (kind: string, id: string) => `${kind}\u0000${id}`;

describe("TokenStore.consumeAccessoryCounter", () => {
  it("accepts a first tap and records the high-water", () => {
    const { store: s, rows } = store();
    expect(s.consumeAccessoryCounter("tap", CHIP, 5)).toBe(true);
    expect(rows.get(rowKey("tap", CHIP))?.c).toBe(5);
  });

  it("accepts strictly increasing counters only", () => {
    const { store: s } = store();
    expect(s.consumeAccessoryCounter("tap", CHIP, 5)).toBe(true);
    expect(s.consumeAccessoryCounter("tap", CHIP, 6)).toBe(true);
    // replay of the same counter
    expect(s.consumeAccessoryCounter("tap", CHIP, 6)).toBe(false);
    // an older captured tap
    expect(s.consumeAccessoryCounter("tap", CHIP, 3)).toBe(false);
    // still advances afterwards
    expect(s.consumeAccessoryCounter("tap", CHIP, 7)).toBe(true);
  });

  it("does not advance the high-water on a rejected replay", () => {
    const { store: s, rows } = store();
    s.consumeAccessoryCounter("tap", CHIP, 10);
    s.consumeAccessoryCounter("tap", CHIP, 4);
    expect(rows.get(rowKey("tap", CHIP))?.c).toBe(10);
  });

  it("tracks chips independently", () => {
    const { store: s } = store();
    expect(s.consumeAccessoryCounter("tap", CHIP, 9)).toBe(true);
    // A different chip starts fresh — its counter is unrelated.
    expect(s.consumeAccessoryCounter("tap", "chip-identifier-b", 2)).toBe(true);
  });
});

// The dynamic URL's `c` and the WebAuthn `signCount` are unrelated registers on
// the same chip. Sharing one row would let the higher counter permanently lock
// out the other proof type, so they must advance independently.
describe("counter kinds are independent", () => {
  it("does not let a high tap counter block a low signCount", () => {
    const { store: s } = store();
    expect(s.consumeAccessoryCounter("tap", CHIP, 900)).toBe(true);
    expect(s.consumeAccessoryCounter("webauthn", CHIP, 3)).toBe(true);
  });

  it("tracks each kind's high-water separately", () => {
    const { store: s } = store();
    expect(s.consumeAccessoryCounter("webauthn", CHIP, 5)).toBe(true);
    // Same value replayed on the same kind is a replay...
    expect(s.consumeAccessoryCounter("webauthn", CHIP, 5)).toBe(false);
    // ...but it is untouched territory for the other kind.
    expect(s.consumeAccessoryCounter("tap", CHIP, 5)).toBe(true);
  });
});
