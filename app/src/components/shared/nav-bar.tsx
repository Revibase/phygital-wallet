"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useShellStageSlot } from "@/components/layout/app-shell";
import { useWalletChrome } from "@/components/wallet/wallet-desktop-chrome";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { cn } from "@/lib/utils";

export type NavBarSlots = {
  leading?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
};

/** Ghost Back control for sheet / stage NavBars. Hidden on desktop when rail is enough. */
export function NavBarBack({
  onClick,
  disabled,
  className,
  desktopHidden = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  desktopHidden?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(desktopHidden && "lg:hidden", className)}
    >
      {copy.common.back}
    </Button>
  );
}

/** Single chrome row — leading · title · trailing.
 * Phone: title always centered. `align="start"` only kicks in from `lg`.
 */
function NavBarFrame({
  leading,
  title,
  trailing,
  className,
  align = "center",
}: NavBarSlots & { className?: string; align?: "center" | "start" }) {
  const desktopStart = align === "start";
  return (
    <div
      className={cn(
        "relative flex min-h-11 items-center justify-between gap-2",
        className
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center justify-start gap-2",
          desktopStart && "lg:flex-none lg:shrink-0"
        )}
      >
        {leading ?? <span className="w-11" aria-hidden />}
      </div>
      {title != null ? (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate text-center text-sm font-semibold tracking-tight",
            desktopStart &&
              "lg:pointer-events-auto lg:static lg:max-w-none lg:min-w-0 lg:flex-1 lg:translate-x-0 lg:text-left"
          )}
        >
          {title}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {trailing ?? <span className="w-11" aria-hidden />}
      </div>
    </div>
  );
}

/**
 * Page nav. Inside {@link AppShell}, portals into the shell header — one chrome
 * line. Outside the shell, renders inline.
 * Prefer `align="start"` inside desktop wallet main panes.
 */
export function NavBar({
  leading,
  title,
  trailing,
  className,
  align = "center",
  /** Hide entirely from `lg` up (rail replaces this chrome). */
  desktopHidden = false,
}: NavBarSlots & {
  className?: string;
  align?: "center" | "start";
  desktopHidden?: boolean;
}) {
  const stage = useShellStageSlot();
  const chrome = useWalletChrome();
  const mount = stage?.mount ?? null;
  const setActive = stage?.setActive;
  // Inside wallet desktop chrome, keep nav in the main pane (not above the rail).
  const preferInline = Boolean(chrome?.hasRail);
  const inShell = Boolean(stage) && !preferInline;
  // Portal target is client-only; keep SSR + first paint null so they match.
  const [canPortal, setCanPortal] = useState(false);

  useLayoutEffect(() => {
    setCanPortal(true);
  }, []);

  useLayoutEffect(() => {
    if (!setActive || preferInline) return;
    if (!desktopHidden) {
      setActive(true);
      return () => setActive(false);
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setActive(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      setActive(false);
    };
  }, [setActive, desktopHidden, preferInline]);

  const frame = (
    <NavBarFrame
      leading={leading}
      title={title}
      trailing={trailing}
      align={preferInline ? "start" : align}
      className={cn(
        (!inShell || preferInline) && "mb-3",
        desktopHidden && "lg:hidden",
        className
      )}
    />
  );

  if (inShell) {
    if (!canPortal || !mount) return null;
    return createPortal(frame, mount);
  }

  return frame;
}
