"use client";

import type { ReactNode } from "react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { AppShell } from "@/components/layout/app-shell";
import { copy } from "@/lib/copy/phygital";
import { galleryAnimate } from "@/lib/motion";
import type { ShellLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** Shared route loading splash (Suspense / dynamic import). */
export function RouteBoot({
  layout = "compact",
  message = copy.common.loading,
  children,
}: {
  layout?: ShellLayout;
  /** Status under the mark — default is generic loading, not NFC-specific. */
  message?: string;
  children?: ReactNode;
}) {
  return (
    <AppShell layout={layout}>
      <div
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-14"
        role="status"
        aria-live="polite"
        aria-label={message}
      >
        <div
          className={cn("relative z-10 text-primary", galleryAnimate.rise)}
          aria-hidden
        >
          <RevibaseMark className="size-10 opacity-90" />
        </div>
        <div
          className={cn(
            "relative z-10 h-1 w-24 overflow-hidden rounded-full bg-primary/15",
            galleryAnimate.rise,
          )}
          aria-hidden
        >
          <div
            className={cn(
              "h-full w-1/2 rounded-full bg-primary",
              galleryAnimate.shimmer,
            )}
          />
        </div>
        <p className="relative z-10 text-xs text-muted-foreground">{message}</p>
      </div>
      {children}
    </AppShell>
  );
}
