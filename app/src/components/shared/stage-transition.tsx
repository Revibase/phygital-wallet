"use client";

import type { ReactNode } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";

import { easeOut, galleryAnimate } from "@/lib/motion";
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

  const enter = variant === "fade" ? { opacity: 0 } : { opacity: 0, y: 6 };
  const animate = variant === "fade" ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={stageKey}
          className={cn(fillClass, className)}
          initial={enter}
          animate={animate}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.14,
            ease: easeOut,
          }}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}
