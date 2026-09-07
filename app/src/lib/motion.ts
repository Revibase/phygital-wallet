/**
 * Luminous Object motion — Apple-fast, compositor-friendly.
 * Prefer opacity + tiny translate. Never animate filter/blur (feels soft and laggy).
 */

/** Shared ease — iOS-like deceleration. */
export const easeOut = [0.22, 1, 0.36, 1] as const;

export const snapEnterTransition = {
  duration: 0.18,
  ease: easeOut,
};

export function snapEnter(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    };
  }
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
  };
}

export const STAGGER_STEP_MS = 24;
export const STAGGER_CAP = 4;
/** Sticky dock trails content settle on token / claim landings. */
export const STICKY_ENTER_DELAY_MS = 40;

/** Cap stagger index so grids with many items don't cascade too long. */
export function staggerStyle(index: number): { animationDelay: string } {
  const capped = Math.min(index, STAGGER_CAP);
  return { animationDelay: `${capped * STAGGER_STEP_MS}ms` };
}

/** Framer stage push — short, no blur, no wait stacking. */
export const stageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: easeOut },
} as const;

export const stageFadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.14, ease: easeOut },
} as const;

export const galleryAnimate = {
  rise: "motion-safe:animate-[gallery-rise_0.22s_cubic-bezier(0.22,1,0.36,1)_both]",
  fade: "motion-safe:animate-[gallery-fade_0.16s_ease-out_both]",
  scaleIn:
    "motion-safe:animate-[gallery-scale-in_0.22s_cubic-bezier(0.22,1,0.36,1)_both]",
  check:
    "motion-safe:animate-[gallery-check_0.22s_cubic-bezier(0.22,1,0.36,1)_both]",
  shimmer: "motion-safe:animate-[gallery-shimmer_1.1s_ease-in-out_infinite]",
  pulse: "motion-safe:animate-[gallery-pulse_1.2s_ease-out]",
  successRing:
    "motion-safe:animate-[gallery-rise_0.22s_cubic-bezier(0.22,1,0.36,1)]",
  slideUp:
    "motion-safe:animate-[gallery-slide-up_0.24s_cubic-bezier(0.22,1,0.36,1)_both]",
  stage:
    "motion-safe:animate-[gallery-stage_0.2s_cubic-bezier(0.22,1,0.36,1)_both]",
  /** Opacity-only — preferred for wrappers that contain sticky. */
  stageFade: "motion-safe:animate-[gallery-stage-fade_0.16s_ease-out_both]",
  /** Object / key reveal — short spring, not a slow flourish. */
  reveal:
    "motion-safe:animate-[luminous-reveal_0.42s_cubic-bezier(0.22,1,0.36,1)_both]",
  /** Authenticity seal tick. */
  seal:
    "motion-safe:animate-[luminous-seal_0.28s_cubic-bezier(0.34,1.4,0.64,1)_both]",
  /** Soft aura breath on boot. */
  auraBreath:
    "motion-safe:animate-[luminous-aura-breath_4s_ease-in-out_infinite]",
} as const;
