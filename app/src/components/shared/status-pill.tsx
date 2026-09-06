"use client";

import { CheckCircle2 } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { galleryAnimate } from "@/lib/motion";

/** Quiet authenticity / role status — never jargon. */
export function StatusPill({
  label,
  tone = "neutral",
  sealed = false,
  className,
  ...props
}: {
  label: string;
  tone?: "neutral" | "success" | "accent";
  /** Play seal tick animation once. */
  sealed?: boolean;
  className?: string;
} & ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight",
        tone === "success" && "bg-success/12 text-success",
        tone === "accent" && "bg-primary/12 text-primary",
        tone === "neutral" && "bg-muted/60 text-muted-foreground",
        sealed && galleryAnimate.seal,
        className,
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
