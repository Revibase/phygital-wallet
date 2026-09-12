"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Full-viewport ceremony frame for Hold / verify / claim success.
 * Keeps optional chrome (Cancel) out of the flex grow so NfcHoldStatus can center.
 */
export function CeremonyShell({
  leading,
  children,
  className,
}: {
  /** Top chrome — Cancel, NavBar, step label. */
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {leading ? <div className="relative z-20 shrink-0">{leading}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
