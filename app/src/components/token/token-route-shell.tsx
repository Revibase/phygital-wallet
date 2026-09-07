"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/layout/app-shell";
import type { ShellLayout } from "@/lib/layout";

type SetHeaderExtra = (node: ReactNode) => void;

const ShellHeaderContext = createContext<SetHeaderExtra | null>(null);

/**
 * Register trailing chrome in the AppShell nav row.
 * - `undefined` — leave whatever is currently set (another owner)
 * - `null` / node — set, and clear on unmount or when deps change away
 */
export function useShellHeaderExtra(extra: ReactNode | undefined) {
  const setHeaderExtra = useContext(ShellHeaderContext);

  useLayoutEffect(() => {
    if (!setHeaderExtra) return;
    if (extra === undefined) return;
    setHeaderExtra(extra);
    return () => setHeaderExtra(null);
  }, [setHeaderExtra, extra]);
}

/** Chrome for `/token` — optional headerExtra from descendants. */
export function TokenRouteShell({
  children,
  layout = "compact",
}: {
  children?: ReactNode;
  layout?: ShellLayout;
}) {
  const [headerExtra, setHeaderExtraState] = useState<ReactNode>(null);
  const setHeaderExtra = useCallback<SetHeaderExtra>((node) => {
    setHeaderExtraState(node);
  }, []);

  return (
    <ShellHeaderContext.Provider value={setHeaderExtra}>
      <AppShell layout={layout} headerExtra={headerExtra}>
        {children}
      </AppShell>
    </ShellHeaderContext.Provider>
  );
}
