/**
 * Generic device-local list store backed by localStorage.
 *
 * Provides cached reads, cross-tab sync via the `storage` event, and same-tab
 * updates via a custom event — used by local wallet activity.
 */

export type LocalStore<T> = {
  readonly empty: readonly T[];
  list: () => readonly T[];
  write: (items: readonly T[]) => void;
  subscribe: (onStoreChange: () => void) => () => void;
};

export function createLocalStore<T>(config: {
  storageKey: string;
  eventName: string;
  maxItems: number;
  empty: readonly T[];
  label: string;
  parse: (raw: string | null) => readonly T[];
}): LocalStore<T> {
  let cachedRaw: string | null | undefined;
  let cachedItems: readonly T[] = config.empty;

  function list(): readonly T[] {
    if (typeof window === "undefined") return config.empty;
    const raw = window.localStorage.getItem(config.storageKey);
    if (raw === cachedRaw) return cachedItems;
    cachedRaw = raw;
    cachedItems = config.parse(raw);
    return cachedItems;
  }

  function write(items: readonly T[]) {
    if (typeof window === "undefined") return;
    const raw = JSON.stringify(items.slice(0, config.maxItems));
    window.localStorage.setItem(config.storageKey, raw);
    cachedRaw = raw;
    cachedItems = config.parse(raw);
    window.dispatchEvent(new Event(config.eventName));
  }

  function subscribe(onStoreChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = () => onStoreChange();
    window.addEventListener(config.eventName, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(config.eventName, handler);
      window.removeEventListener("storage", handler);
    };
  }

  return {
    empty: config.empty,
    list,
    write,
    subscribe,
  };
}

/** Stable filtered snapshot for useSyncExternalStore keyed by a string (e.g. wallet). */
export function createFilteredSnapshot<T>(
  store: LocalStore<T>,
  filterFn: (items: readonly T[], key: string) => readonly T[],
): {
  get: (key: string | null) => readonly T[];
  invalidate: () => void;
} {
  let cachedKey: string | null = null;
  let cachedResult: readonly T[] = store.empty;

  return {
    get(key: string | null) {
      if (!key) return store.empty;
      const normalized = key.trim();
      store.list();
      if (normalized === cachedKey) return cachedResult;
      cachedKey = normalized;
      const filtered = filterFn(store.list(), normalized);
      cachedResult = filtered.length === 0 ? store.empty : filtered;
      return cachedResult;
    },
    invalidate() {
      cachedKey = null;
    },
  };
}
