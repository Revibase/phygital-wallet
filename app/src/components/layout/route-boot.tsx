"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { LuminousAura } from "@/components/shared/luminous-aura";
import { brand, copy } from "@/lib/copy/phygital";
import { galleryAnimate } from "@/lib/motion";
import type { ShellLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** Shared route loading splash (Suspense / dynamic import). */
export function RouteBoot({
  layout = "compact",
  children,
}: {
  layout?: ShellLayout;
  children?: ReactNode;
}) {
  return (
    <AppShell layout={layout}>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-14">
        <LuminousAura intensity="strong" />
        <div
          className={cn(
            "relative z-10 h-1.5 w-28 overflow-hidden rounded-full bg-primary/15",
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
        <p className="relative z-10 font-(family-name:--font-display) text-sm font-medium tracking-tight text-foreground">
          {brand.company}
        </p>
        <p className="relative z-10 text-xs text-muted-foreground">
          {copy.wallet.readingAccessory}
        </p>
      </div>
      {children}
    </AppShell>
  );
}
