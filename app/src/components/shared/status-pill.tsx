"use client";

import { CheckCircle2 } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Quiet status chip — never jargon. */
export function StatusPill({
  label,
  tone = "neutral",
  className,
  ...props
}: {
  label: string;
  tone?: "neutral" | "success" | "accent";
  className?: string;
} & ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight",
        tone === "success" && "bg-success/12 text-success",
        tone === "accent" && "bg-primary/12 text-primary",
        tone === "neutral" && "bg-muted/60 text-muted-foreground",
        className
      )}
      {...props}
    >
      {tone === "success" ? (
        <CheckCircle2 className="size-3 shrink-0" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}
