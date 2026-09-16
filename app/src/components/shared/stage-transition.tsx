"use client";

import type { ReactNode } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";

import { galleryAnimate, stageFadeMotion, stageMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const fillClass = "flex min-h-0 flex-1 flex-col";

/** Keyed screen push — snappy, no blur. Short wait so layouts never double-stack. */
export function StageTransition({
  stageKey,
  children,
  className,
  variant = "stage",
}: {
  stageKey: string;
  children: ReactNode;
  className?: string;
  /** `fade` avoids transform under sticky (gate); `stage` for body pushes. */
  variant?: "stage" | "fade";
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    const motionClass =
      variant === "fade" ? galleryAnimate.stageFade : galleryAnimate.stage;
    return (
      <div key={stageKey} className={cn(fillClass, motionClass, className)}>
        {children}
      </div>
    );
  }

  const motion = variant === "fade" ? stageFadeMotion : stageMotion;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={stageKey}
          className={cn(fillClass, className)}
          initial={motion.initial}
          animate={motion.animate}
          exit={motion.exit}
          transition={motion.transition}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}
