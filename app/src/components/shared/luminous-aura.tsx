"use client";

import { cn } from "@/lib/utils";
import { galleryAnimate } from "@/lib/motion";

/**
 * Soft atmospheric wash behind wallet / reveal surfaces.
 * Optional hue overrides sample from collectible art via CSS vars.
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
        ? "opacity-60"
        : "opacity-80";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "absolute -left-1/4 top-[-10%] size-[70vmax] rounded-full bg-aura blur-3xl",
          opacity,
          breathing && galleryAnimate.auraBreath,
        )}
      />
      <div
        className={cn(
          "absolute -right-1/5 bottom-[-5%] size-[55vmax] rounded-full bg-aura-secondary blur-3xl",
          opacity,
          breathing && galleryAnimate.auraBreath,
        )}
        style={{ animationDelay: "1.1s" }}
      />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
