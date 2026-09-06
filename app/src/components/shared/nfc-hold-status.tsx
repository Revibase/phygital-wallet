"use client";

import type { ReactNode } from "react";

import { CollectibleOrb } from "@/components/token/collectible-orb";
import { copyBlockClass, ctaBlockClass } from "@/lib/layout";
import { galleryAnimate, staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Shared Hold ceremony — unlock, verify, claim, send, nearby, fees, policies.
 * Full-screen focused coach with progress ring affordance on the orb.
 * Atmosphere comes from AppShell’s LuminousAura (do not nest a clipped wash).
 */
export function NfcHoldStatus({
  title,
  body,
  pulsing = true,
  busy = false,
  size = "md",
  tone = "default",
  action,
  header,
  imageSrc,
  imageAlt = "",
  progress = false,
  className,
}: {
  title: string;
  body?: string;
  pulsing?: boolean;
  busy?: boolean;
  size?: "md" | "lg";
  /** Success morphs the ring into the green check (same stage as Hold). */
  tone?: "default" | "success";
  action?: ReactNode;
  header?: ReactNode;
  /** DAS mint art for the circular hold target; NFC glyph if missing. */
  imageSrc?: string | null;
  imageAlt?: string;
  /** Animate hold progress ring while busy. */
  progress?: boolean;
  className?: string;
}) {
  const base = header ? 1 : 0;
  const titleClassName =
    "text-display-md tracking-tight md:text-2xl text-foreground";
  const showProgress = progress || busy;

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-8 text-center sm:py-14",
        className,
      )}
    >
      {header ? (
        <div
          className={cn("relative z-10 w-full max-w-sm", galleryAnimate.rise)}
          style={staggerStyle(0)}
        >
          {header}
        </div>
      ) : null}
      <div className="relative z-10" style={staggerStyle(base)}>
        <CollectibleOrb
          src={imageSrc}
          alt={imageAlt}
          size={size}
          pulsing={pulsing}
          busy={busy}
          tone={tone}
          progress={showProgress && tone !== "success"}
        />
      </div>
      <div
        className={cn(
          copyBlockClass,
          "relative z-10 space-y-1.5",
          galleryAnimate.rise,
        )}
        style={staggerStyle(base + 1)}
      >
        <p className={titleClassName}>{title}</p>
        {body ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        ) : null}
      </div>
      {action ? (
        <div
          className={cn(ctaBlockClass, "relative z-10", galleryAnimate.rise)}
          style={staggerStyle(base + 2)}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
