/** React Query ↔ localStorage persistence (browser only). */

import {
  type Persister,
  type PersistedClient,
} from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";

/** Keep persisted cache at least this long (must match QueryClient `gcTime`). */
export const QUERY_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

const STORAGE_KEY = "phygital-wallet.react-query";

/**
 * Bump to drop incompatible cached shapes after schema changes.
 * v17: activity from client getTransactionsForAddress (cursor pagination).
 */
const CACHE_BUSTER = "v17";

export { CACHE_BUSTER };

const BIGINT_TAG = "$bigint" as const;
const MAP_TAG = "$map" as const;

type TaggedBigInt = { [BIGINT_TAG]: string };
type TaggedMap = { [MAP_TAG]: [unknown, unknown][] };

/** Roots worth instant paint. Must match `queryKeys` in `./keys.ts`. */
const PERSISTED_QUERY_ROOTS = new Set([
  "phygitalTokens",
  "dasCollectible",
  "mintedCollectibleView",
  "walletPortfolio",
  "feeBalance",
  "verifiedTokens",
  "walletPolicy",
]);

function isTaggedBigInt(value: object): value is TaggedBigInt {
  return (
    BIGINT_TAG in value &&
    typeof (value as TaggedBigInt)[BIGINT_TAG] === "string"
  );
}

function isTaggedMap(value: object): value is TaggedMap {
  return MAP_TAG in value && Array.isArray((value as TaggedMap)[MAP_TAG]);
}

/** Default JSON.stringify throws on bigint and turns Map into `{}`. */
export function serializeQueryCache(client: PersistedClient): string {
  return JSON.stringify(client, (_key, value: unknown) => {
    if (typeof value === "bigint") {
      return { [BIGINT_TAG]: value.toString() } satisfies TaggedBigInt;
    }
    if (value instanceof Map) {
      return { [MAP_TAG]: [...value.entries()] } satisfies TaggedMap;
    }
    return value;
  });
}

export function deserializeQueryCache(cached: string): PersistedClient {
  return JSON.parse(cached, (_key, value: unknown) => {
    if (value && typeof value === "object") {
      if (isTaggedBigInt(value)) return BigInt(value[BIGINT_TAG]);
      if (isTaggedMap(value)) return new Map(value[MAP_TAG]);
    }
    return value;
  }) as PersistedClient;
}

export function isPersistedQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== "string" || !PERSISTED_QUERY_ROOTS.has(root)) {
    return false;
  }
  return true;
}

export function shouldDehydrateQuery(query: Query): boolean {
  return (
    defaultShouldDehydrateQuery(query) && isPersistedQueryKey(query.queryKey)
  );
}

/**
 * Sync localStorage persister. No-op during SSR (Next may evaluate providers
 * on the server; PersistQueryClientProvider still needs a Persister object).
 */
export function createQueryPersister(): Persister {
  if (typeof window === "undefined") {
    return {
      persistClient: async () => {},
      restoreClient: async () => undefined,
      removeClient: async () => {},
    };
  }

  return createSyncStoragePersister({
    storage: window.localStorage,
    key: STORAGE_KEY,
    serialize: serializeQueryCache,
    deserialize: deserializeQueryCache,
  });
}
