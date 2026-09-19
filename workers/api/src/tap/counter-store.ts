import { getD1 } from "@/shared/db";
import {
  evaluateCounter,
  type CounterVerdict,
} from "@/tap/counter-session";

/**
 * D1-backed high-water mark for tap anti-replay (atomic consume).
 */

/**
 * Atomically consume a tap counter.
 * Returns `replay` if the counter is not strictly greater than the stored mark.
 */
export async function consumeCounterSession(
  identifier: string,
  counter: number,
): Promise<CounterVerdict> {
  const db = getD1();
  const now = Date.now();

  const existing = await db
    .prepare(`SELECT c FROM tap_counters WHERE identifier = ?`)
    .bind(identifier)
    .first<{ c: number }>();

  const floor =
    existing && Number.isFinite(existing.c) ? existing.c : null;
  if (evaluateCounter(floor != null ? { c: floor } : null, counter) === "replay") {
    return "replay";
  }

  const result = await db
    .prepare(
      `INSERT INTO tap_counters (identifier, c, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(identifier) DO UPDATE SET
         c = excluded.c,
         updated_at = excluded.updated_at
       WHERE tap_counters.c < excluded.c`,
    )
    .bind(identifier, counter, now)
    .run();

  return (result.meta?.changes ?? 0) > 0 ? "new" : "replay";
}
