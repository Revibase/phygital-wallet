"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function groupedRowClass({
  interactive,
  destructive,
  className,
}: {
  interactive: boolean;
  destructive?: boolean;
  className?: string;
}) {
  return cn(
    interactive
      ? "h-auto min-h-11 w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal hover:bg-muted/50 active:bg-muted/70"
      : "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
    destructive && "text-destructive",
    interactive && destructive && "hover:text-destructive",
    className
  );
}

export function GroupedList({
  children,
  className,
  label,
  footer,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      {label ? <h2 className="text-section-label px-4">{label}</h2> : null}
      <ul className="overflow-hidden rounded-2xl border border-border/30 bg-grouped text-grouped-foreground shadow-[0_1px_0_rgba(255,255,255,0.4)_inset] backdrop-blur-md">
        {children}
      </ul>
      {footer ? (
        <p className="px-4 text-xs leading-relaxed text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </section>
  );
}

export function GroupedRow({
  children,
  className,
  onClick,
  href,
  leading,
  trailing,
  subtitle,
  destructive,
  asChild,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** External link — renders as anchor instead of button/div. */
  href?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  subtitle?: ReactNode;
  destructive?: boolean;
  /** Pass a single element (e.g. motion button); leading/trailing are ignored. */
  asChild?: boolean;
}) {
  const interactive = Boolean(onClick || href || asChild);
  const rowClass = groupedRowClass({ interactive, destructive, className });

  if (asChild) {
    return (
      <li className="border-b border-border/50 last:border-b-0">
        <Button asChild variant="ghost" className={rowClass}>
          {children}
        </Button>
      </li>
    );
  }

  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{children}</div>
        {subtitle ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {trailing ??
        (onClick ? (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : null)}
    </>
  );

  return (
    <li className="border-b border-border/50 last:border-b-0">
      {href ? (
        <Button
          variant="ghost"
          asChild
          className={cn(rowClass, "hover:bg-muted/20")}
        >
          <a href={href} target="_blank" rel="noreferrer">
            {body}
          </a>
        </Button>
      ) : onClick ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onClick}
          className={rowClass}
        >
          {body}
        </Button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}
