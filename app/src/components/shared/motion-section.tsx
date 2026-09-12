"use client";

import type { CSSProperties, ReactNode } from "react";

import { galleryAnimate, staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Consistent enter transition for gallery sections. */
export function MotionSection({
  children,
  className,
  staggerIndex,
  variant = "rise",
}: {
  children: ReactNode;
  className?: string;
  staggerIndex?: number;
  variant?: "rise" | "fade" | "scaleIn";
}) {
  const animation =
    variant === "fade"
      ? galleryAnimate.fade
      : variant === "scaleIn"
      ? galleryAnimate.scaleIn
      : galleryAnimate.rise;

  const style: CSSProperties | undefined =
    staggerIndex !== undefined ? staggerStyle(staggerIndex) : undefined;

  return (
    <div className={cn(animation, className)} style={style}>
      {children}
    </div>
  );
}
