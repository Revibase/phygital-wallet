"use client";

import { cn } from "@/lib/utils";
import { galleryAnimate } from "@/lib/motion";

/**
 * Soft atmospheric wash — radial fades into the page background.
 * Mount once at the shell (full viewport). Do not nest inside content stacks;
 * clipped boxes turn the wash into a hard-edged panel.
 */
export function LuminousAura({
  className,
  breathing = true,
  intensity = "default",
}: {
  className?: string;
  breathing?: boolean;
  intensity?: "default" | "soft" | "strong";
}) {
  const opacity =
    intensity === "strong"
      ? "opacity-100"
      : intensity === "soft"
      ? "opacity-55"
      : "opacity-75";

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
    >
      <div
        className={cn(
          "absolute inset-0",
          opacity,
          breathing && galleryAnimate.auraBreath
        )}
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 90% 70% at 28% 8%, var(--aura) 0%, transparent 72%)",
            "radial-gradient(ellipse 80% 55% at 88% 92%, var(--aura-secondary) 0%, transparent 68%)",
            "radial-gradient(ellipse 55% 40% at 50% 42%, color-mix(in oklab, var(--aura) 35%, transparent) 0%, transparent 70%)",
          ].join(", "),
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
