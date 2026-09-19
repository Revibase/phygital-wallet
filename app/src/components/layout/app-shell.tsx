"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LuminousAura } from "@/components/shared/luminous-aura";
import {
  shellDeviceFrameClass,
  shellLayoutClass,
  shellPaddingClass,
  walletShellPaddingClass,
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

/**
 * Keeps route `{children}` outside stageActive state updates so NavBar
 * portal registration doesn’t re-render the whole page tree.
 */
const ShellMainContent = memo(function ShellMainContent({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
});

function ShellFrame({
  children,
  layout,
}: {
  children: ReactNode;
  layout: ShellLayout;
}) {
  const [stageMount, setStageMount] = useState<HTMLElement | null>(null);
  const [stageActive, setStageActive] = useState(false);
  // Refcount: overlapping NavBars (e.g. form kept mounted under a ceremony)
  // must not let the exiting bar's cleanup hide the stage while another remains.
  const stageActiveCount = useRef(0);
  const setActive = useCallback((active: boolean) => {
    stageActiveCount.current = Math.max(
      0,
      stageActiveCount.current + (active ? 1 : -1),
    );
    setStageActive(stageActiveCount.current > 0);
  }, []);

  const stageApi = useMemo(
    () => ({ mount: stageMount, setActive }),
    [stageMount, setActive],
  );

  const isWallet = layout === "wallet";
  const isCompact = layout === "compact";
  const padding = isWallet ? walletShellPaddingClass : shellPaddingClass;

  return (
    <ShellStageSlotContext.Provider value={stageApi}>
      <main
        className={cn(
          "relative z-10 flex w-full min-w-0 flex-1 flex-col self-center",
          (isWallet || isCompact) && "lg:self-stretch",
          padding,
          shellLayoutClass[layout],
          shellDeviceFrameClass[layout],
        )}
      >
        <div
          className={cn(
            stageActive && "mb-4 md:mb-5",
            stageActive && isWallet && "lg:mb-0 lg:px-8 lg:pt-6",
            stageActive && galleryAnimate.rise,
          )}
        >
          <div
            ref={setStageMount}
            className={cn(!stageActive && "hidden")}
            aria-hidden={!stageActive}
          />
        </div>
        <ShellMainContent>{children}</ShellMainContent>
      </main>
    </ShellStageSlotContext.Provider>
  );
}

/** Chrome for every route: stage nav when a NavBar registers; no idle brand row. */
export function AppShell({
  children,
  layout = "compact",
}: {
  children: ReactNode;
  layout?: ShellLayout;
}) {
  const isWallet = layout === "wallet";
  const isCompact = layout === "compact";

  return (
    <div
      className={cn(
        "relative flex min-h-dvh flex-1 flex-col items-center overflow-x-clip bg-background",
        (isWallet || isCompact) && "lg:items-stretch",
      )}
    >
      <LuminousAura intensity="default" />
      <ShellFrame layout={layout}>{children}</ShellFrame>
    </div>
  );
}
