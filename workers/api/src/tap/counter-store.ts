import { getEnv } from "@/shared/request-context";
import {
  parseCounterState,
  type CounterState,
} from "@/tap/counter-session";

/**
 * KV-backed high-water mark for tap anti-replay (counter only, no TTL).
 * Reuses the `revibase_auth_kv` namespace under a `tap:counter:` prefix so no
 * separate binding is required.
 */

const COUNTER_PREFIX = "tap:counter:";

function counterKey(identifier: string): string {
  return `${COUNTER_PREFIX}${identifier}`;
}

export async function readCounterSession(
  identifier: string,
): Promise<CounterState | null> {
  return parseCounterState(
    await getEnv().revibase_auth_kv.get(counterKey(identifier)),
  );
}

export async function writeCounterSession(
  identifier: string,
  state: CounterState,
): Promise<void> {
  await getEnv().revibase_auth_kv.put(
    counterKey(identifier),
    JSON.stringify({ c: state.c, t: Date.now() }),
  );
}
