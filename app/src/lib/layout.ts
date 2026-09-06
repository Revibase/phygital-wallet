/** Shared layout tokens for AppShell — keep routes visually cohesive. */

/**
 * Column widths:
 * - gallery: minted card detail (room for art + dossier)
 * - home: owned cards/accessories list — phone column → wider desktop
 * - compact: NFC ceremony / wallet / accessory — phone-width on all breakpoints
 */
export const shellLayoutClass = {
  gallery: "max-w-lg md:max-w-3xl lg:max-w-5xl",
  home: "max-w-md md:max-w-2xl lg:max-w-3xl w-full",
  /** Focused device column — never stretches on desktop. */
  compact: "max-w-md w-full",
} as const;

/** Home form-factor sections: stack on phone, side-by-side when both exist. */
export const homeSectionsClass =
  "flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-6 lg:gap-8";

export type ShellLayout = keyof typeof shellLayoutClass;

/**
 * Horizontal + vertical chrome — identical on every route.
 * `max()` keeps iOS notches / home-indicator landscape insets from clipping.
 */
export const shellPaddingClass = [
  "pt-[max(1.25rem,env(safe-area-inset-top))]",
  "pb-[max(1rem,env(safe-area-inset-bottom))]",
  "pl-[max(1rem,env(safe-area-inset-left))]",
  "pr-[max(1rem,env(safe-area-inset-right))]",
  "sm:pl-[max(1.5rem,env(safe-area-inset-left))]",
  "sm:pr-[max(1.5rem,env(safe-area-inset-right))]",
  "md:pl-[max(2rem,env(safe-area-inset-left))]",
  "md:pr-[max(2rem,env(safe-area-inset-right))]",
  "lg:pl-[max(2.5rem,env(safe-area-inset-left))]",
  "lg:pr-[max(2.5rem,env(safe-area-inset-right))]",
].join(" ");

/** Sticky dock — spans the shell column only (not full viewport on desktop). */
export const stickyDockClass = "w-full max-w-full self-stretch";

/** Centered ceremony / gate copy blocks. */
export const copyBlockClass = "w-full max-w-72 mx-auto";

/** Centered single-action blocks below ceremony copy. */
export const ctaBlockClass = "w-full max-w-xs mx-auto";

/** Centered gate / loading blocks. */
export const centeredBlockClass =
  "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-10 sm:py-14 text-center";

/**
 * Minted card detail: stacked art → dossier on the phone, side-by-side
 * marketplace layout from `lg` up.
 */
export const detailSplitClass =
  "flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]";

/** Minimum touch / click target (Apple HIG 44pt). */
export const touchTargetClass = "min-h-11 min-w-11";
