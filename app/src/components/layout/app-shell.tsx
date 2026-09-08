"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LuminousAura } from "@/components/shared/luminous-aura";
import {
  shellDeviceFrameClass,
  shellLayoutClass,
  shellPaddingClass,
  type ShellLayout,
} from "@/lib/layout";
import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ShellStageSlotContext = createContext<{
  mount: HTMLElement | null;
  setActive: (active: boolean) => void;
} | null>(null);

/** Host page nav in the AppShell row. */
export function useShellStageSlot() {
  return useContext(ShellStageSlotContext);
}

/** Chrome for every route: stage nav when a NavBar registers; no idle brand row. */
export function AppShell({
  children,
  layout = "compact",
}: {
  children: ReactNode;
  layout?: ShellLayout;
}) {
  const [stageMount, setStageMount] = useState<HTMLElement | null>(null);
  const [stageActive, setStageActive] = useState(false);

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
            shellDeviceFrameClass[layout],
          )}
        >
          <div
            className={cn(
              stageActive && "mb-4 md:mb-5",
              stageActive && galleryAnimate.rise,
            )}
          >
            <div
              ref={setStageMount}
              className={cn(!stageActive && "hidden")}
              aria-hidden={!stageActive}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </main>
      </div>
    </ShellStageSlotContext.Provider>
  );
}
