"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

import { LuminousAura } from "@/components/shared/luminous-aura";
import { Badge } from "@/components/ui/badge";
import { brand, copy } from "@/lib/copy/phygital";
import {
  shellLayoutClass,
  shellPaddingClass,
  type ShellLayout,
} from "@/lib/layout";
import { galleryAnimate } from "@/lib/motion";
import { isMainnet } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";

const ShellStageSlotContext = createContext<{
  mount: HTMLElement | null;
  setActive: (active: boolean) => void;
} | null>(null);

/** Host page nav in the AppShell row (replaces brand chrome). */
export function useShellStageSlot() {
  return useContext(ShellStageSlotContext);
}

/** Chrome for every route: brand on roots; stage nav on pushed screens. */
export function AppShell({
  children,
  layout = "compact",
  headerExtra,
  showWordmark = true,
}: {
  children: ReactNode;
  layout?: ShellLayout;
  headerExtra?: ReactNode;
  showWordmark?: boolean;
}) {
  const [showDevnet, setShowDevnet] = useState(false);
  const [stageMount, setStageMount] = useState<HTMLElement | null>(null);
  const [stageActive, setStageActive] = useState(false);

  useEffect(() => {
    setShowDevnet(!isMainnet());
  }, []);

  const stageApi = useMemo(
    () => ({ mount: stageMount, setActive: setStageActive }),
    [stageMount],
  );

  return (
    <ShellStageSlotContext.Provider value={stageApi}>
      <div className="relative flex min-h-dvh flex-1 flex-col items-center overflow-x-clip bg-background">
        <LuminousAura intensity="default" />
        <main
          className={cn(
            "relative z-10 mx-auto flex w-full min-w-0 flex-1 flex-col self-center",
            shellPaddingClass,
            shellLayoutClass[layout],
            (layout === "compact" || layout === "home") &&
              "md:my-4 md:min-h-[min(100dvh-2rem,52rem)] md:overflow-hidden md:rounded-[2rem] md:border md:border-border/40 md:bg-background/80 md:shadow-[0_24px_80px_-32px_var(--card-shadow)] md:backdrop-blur-xl",
          )}
        >
          <div className={cn("mb-4 md:mb-5", galleryAnimate.rise)}>
            <div
              ref={setStageMount}
              className={cn(!stageActive && "hidden")}
              aria-hidden={!stageActive}
            />
            {!stageActive ? (
              <div className="relative flex min-h-11 items-center">
                <div className="flex min-w-0 flex-1 items-center justify-start gap-2">
                  {showDevnet ? (
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-border/50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:px-2.5"
                    >
                      <span
                        className="size-1 rounded-full bg-muted-foreground/70"
                        aria-hidden
                      />
                      {copy.common.devnet}
                    </Badge>
                  ) : (
                    <span className="w-4" aria-hidden />
                  )}
                </div>

                {showWordmark ? (
                  <Link
                    href="/"
                    className="absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate font-(family-name:--font-display) text-sm font-semibold tracking-tight text-foreground hover:opacity-80"
                  >
                    {brand.company}
                  </Link>
                ) : null}

                <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                  {headerExtra}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </main>
      </div>
    </ShellStageSlotContext.Provider>
  );
}
