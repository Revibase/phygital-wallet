/** Shared layout tokens for AppShell — keep routes visually cohesive. */

/**
 * Column widths:
 * - home: owned accessories list — phone column → wider desktop
 * - wallet: full-bleed Squads-style shell from lg (sidebar + main)
 * - compact: NFC ceremony outside wallet — phone-width (desktop drops frame via shellDeviceFrame)
 */
export const shellLayoutClass = {
  home: "max-w-md md:max-w-2xl lg:max-w-3xl w-full",
  /** Phone column centered until lg, then full viewport for edge-docked sidebar. */
  wallet: "mx-auto w-full max-w-md md:max-w-2xl lg:mx-0 lg:max-w-none",
  /**
   * Focused column on phone; on desktop stretch full width so boot/hold
   * screens are not a floating phone frame (Squads-style canvas).
   */
  compact: "mx-auto w-full max-w-md lg:mx-0 lg:max-w-none",
} as const;

/**
 * Desktop chrome: phone “device frame” only below lg for compact.
 * Wallet is full-bleed with no float margins.
 */
export const shellDeviceFrameClass = {
  compact:
    "md:my-4 md:max-h-[min(100dvh-2rem,52rem)] md:overflow-y-auto md:rounded-[2rem] md:border md:border-border/40 md:bg-background/80 md:shadow-[0_24px_80px_-32px_var(--card-shadow)] md:backdrop-blur-xl lg:my-0 lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none",
  home: "md:my-6 lg:my-8",
  wallet: "md:my-6 lg:my-0",
} as const;

/** Wallet home tokens + collectibles: stack on phone, split on tablet+. */
export const walletPortfolioSplitClass =
  "flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-6 lg:gap-8";

/**
 * Desktop wallet chrome: full-height sidebar | scrolling main.
 * Rail is `hidden` below `lg` — mobile keeps the full-page stack.
 */
export const walletDesktopChromeClass =
  "flex flex-1 flex-col gap-0 lg:grid lg:h-full lg:min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-stretch lg:gap-0 xl:grid-cols-[16.5rem_minmax(0,1fr)]";

export const walletDesktopRailClass = [
  "hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-y-auto",
  "lg:border-r lg:border-border/40 lg:bg-background/60 lg:px-3 lg:py-4 lg:pr-3",
].join(" ");

export const walletDesktopMainClass =
  "flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto lg:px-8 lg:py-6";

/**
 * Desktop page title inside wallet chrome — use with `NavBar desktopHidden`.
 */
export const walletDesktopTitleClass =
  "hidden text-large-title tracking-tight lg:block";

/**
 * Narrow form column beside the rail (send, nearby, settings forms).
 * Centered in the main pane on desktop.
 */
export const walletFormColumnClass =
  "flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-md";

/**
 * Reading / list / hub column beside the rail (home, tokens, settings hub).
 * Wider than forms; capped and centered so ultrawide panes stay readable.
 */
export const walletContentColumnClass =
  "flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-2xl";

/**
 * Settings master-detail at lg+ — expands across the main pane.
 */
export const settingsDesktopClass =
  "flex flex-1 flex-col gap-6 lg:grid lg:w-full lg:grid-cols-[minmax(15rem,17.5rem)_minmax(0,1fr)] lg:items-start lg:gap-8";

/** Settings hub groups: stack on phone, two columns when filling the main pane. */
export const settingsHubClass =
  "flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:gap-y-6";

/** Compact master list beside a settings detail (no multi-column). */
export const settingsPanelListClass = "flex flex-col gap-5";

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

/**
 * Wallet shell padding: keep safe-area on mobile; on lg drop outer horizontal
 * padding so the sidebar docks to the viewport edge (main pads itself).
 */
export const walletShellPaddingClass = [
  "pt-[max(1.25rem,env(safe-area-inset-top))]",
  "pb-[max(1rem,env(safe-area-inset-bottom))]",
  "pl-[max(1rem,env(safe-area-inset-left))]",
  "pr-[max(1rem,env(safe-area-inset-right))]",
  "sm:pl-[max(1.5rem,env(safe-area-inset-left))]",
  "sm:pr-[max(1.5rem,env(safe-area-inset-right))]",
  "md:pl-[max(2rem,env(safe-area-inset-left))]",
  "md:pr-[max(2rem,env(safe-area-inset-right))]",
  "lg:pl-[max(0px,env(safe-area-inset-left))]",
  "lg:pr-[max(0px,env(safe-area-inset-right))]",
  "lg:pt-[max(0px,env(safe-area-inset-top))]",
  "lg:pb-[max(0px,env(safe-area-inset-bottom))]",
].join(" ");

/** Sticky dock — spans the shell column only (not full viewport on desktop). */
export const stickyDockClass = "w-full max-w-full self-stretch";

export const copyBlockClass = "w-full max-w-72 mx-auto";

export const ctaBlockClass = "w-full max-w-xs mx-auto";

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
