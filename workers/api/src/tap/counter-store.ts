import { getEnv } from "@/shared/request-context";
import {
  parseCounterState,
  type CounterState,
} from "@/tap/counter-session";

/**
 * KV-backed high-water mark for tap anti-replay (counter only, no TTL).
 * Uses the shared `revibase_counter` namespace (same as vault / developer mint).
 */

function getCounterKv(): KVNamespace {
  const kv = getEnv().revibase_counter;
  if (!kv) {
    throw new Error("KV binding revibase_counter is not configured");
  }
  return kv;
}

export async function readCounterSession(
  identifier: string,
): Promise<CounterState | null> {
  return parseCounterState(await getCounterKv().get(identifier));
}

/** Persist a newly consumed counter. */
export async function writeCounterSession(
  identifier: string,
  state: CounterState,
): Promise<void> {
  await getCounterKv().put(identifier, JSON.stringify({ c: state.c, t: Date.now() }));
}
