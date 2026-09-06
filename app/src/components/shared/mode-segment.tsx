"use client";

import { copy } from "@/lib/copy/phygital";
import { cn } from "@/lib/utils";

/** Apple-style Object | Wallet segmented control. */
export function ModeSegment({
  mode,
  onChange,
  className,
  "aria-label": ariaLabel = "View mode",
}: {
  mode: "object" | "wallet";
  onChange: (mode: "object" | "wallet") => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-9 items-center rounded-full bg-muted/70 p-0.5",
        className,
      )}
    >
      <SegmentTab
        active={mode === "object"}
        onClick={() => onChange("object")}
        label={copy.wallet.modeObject}
      />
      <SegmentTab
        active={mode === "wallet"}
        onClick={() => onChange("wallet")}
        label={copy.wallet.modeWallet}
      />
    </div>
  );
}

function SegmentTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-8 min-w-[4.5rem] rounded-full px-3.5 text-xs font-semibold tracking-tight transition-colors duration-150",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
