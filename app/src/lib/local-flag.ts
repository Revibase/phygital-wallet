"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener();
}

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}

function writeFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "1" : "0");
  emit(key);
}

export function useLocalFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(onStoreChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set?.delete(onStoreChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key]
  );

  const value = useSyncExternalStore(
    subscribe,
    () => readFlag(key),
    () => false
  );

  const setValue = useCallback(
    (next: boolean) => {
      writeFlag(key, next);
    },
    [key]
  );

  return [value, setValue];
}
