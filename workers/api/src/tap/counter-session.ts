/**
 * Server-side counter for tap anti-replay. A chip counter is single-use; the
 * same or lower counter is always rejected. This module only judges monotonic
 * counters — `counter-store` owns IO.
 */

export type CounterState = {
  c: number;
};

export type CounterVerdict = "new" | "replay";

/** Parse stored KV JSON `{ c }` (accepts `{ c, t }` and numeric strings). */
export function parseCounterState(raw: string | null): CounterState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { c?: unknown };
    const c =
      typeof parsed.c === "number"
        ? parsed.c
        : typeof parsed.c === "string"
          ? Number(parsed.c)
          : NaN;
    if (Number.isFinite(c)) {
      return { c };
    }
  } catch {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      return { c: asNumber };
    }
  }
  return null;
}

/**
 * Judge an incoming counter against the stored high-water mark.
 * - `new`: counter > stored (or no state) — consume and advance KV
 * - `replay`: same or lower counter — reject (client must use a fresh tap)
 */
export function evaluateCounter(
  state: CounterState | null,
  counter: number,
): CounterVerdict {
  if (!state || counter > state.c) return "new";
  return "replay";
}
