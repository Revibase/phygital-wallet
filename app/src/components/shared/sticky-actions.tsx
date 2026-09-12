"use client";

import type { CSSProperties, ReactNode } from "react";

import { stickyDockClass } from "@/lib/layout";
import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sticky bottom action dock — primary CTAs across token, claim, collect, pay.
 * Safe-area padding lives here so the shell can stay tight at the bottom.
 */
export function StickyActions({
  children,
  className,
  animate = true,
  enterDelayMs,
}: {
  children: ReactNode;
  className?: string;
  /** Skip slide-up when the dock remounts inside a stage swap. */
  animate?: boolean;
  enterDelayMs?: number;
}) {
  const style: CSSProperties | undefined =
    animate && enterDelayMs != null && enterDelayMs > 0
      ? { animationDelay: `${enterDelayMs}ms` }
      : undefined;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 mt-auto flex flex-col gap-2.5",
        stickyDockClass,
        "border-t border-border/40 bg-background/95 pt-3 backdrop-blur-sm",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        animate && galleryAnimate.slideUp,
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}
