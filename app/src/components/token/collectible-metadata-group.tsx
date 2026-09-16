"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Grouped inset rows — same surface language as GroupedList (UX-033). */
export function CollectibleMetadataGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/30 bg-grouped text-grouped-foreground shadow-[0_1px_0_rgba(255,255,255,0.4)_inset]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CollectibleMetadataRow({
  label,
  children,
  trailing,
  subtitle,
  onPress,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  subtitle?: ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="min-w-0 text-sm font-medium">{children}</div>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
        {subtitle ? (
          <div className="text-xs leading-snug text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
    </>
  );

  const rowClasses = cn(
    "h-auto min-h-11 w-full justify-between gap-3 rounded-none px-4 py-3 text-left font-normal",
    className
  );

  if (onPress) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={onPress}
        className={cn(rowClasses, "hover:bg-muted/50 active:bg-muted/70")}
      >
        {content}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 px-4 py-3",
        className
      )}
    >
      {content}
    </div>
  );
}
