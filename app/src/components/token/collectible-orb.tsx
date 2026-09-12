"use client";

import { useState, type CSSProperties } from "react";
import { CheckCircle2 } from "lucide-react";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * Circular hold target — DAS mint art when available, brand mark fallback.
 * Soft outer pulse + optional SVG progress ring for ceremony affordance.
 */
export function CollectibleOrb({
  src,
  alt = "",
  size = "lg",
  pulsing = true,
  busy = false,
  tone = "default",
  progress = false,
  className,
  style,
}: {
  src?: string | null;
  alt?: string;
  size?: "md" | "lg";
  pulsing?: boolean;
  busy?: boolean;
  tone?: "default" | "success";
  progress?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shell = size === "lg" ? "size-28" : "size-20";
  const artSize = size === "lg" ? "size-[5.5rem]" : "size-14";
  const icon = size === "lg" ? "size-8" : "size-6";
  const success = tone === "success";
  const showPulse = pulsing && !busy && !success && !progress;
  const showArt = !success && Boolean(src) && failedSrc !== src;

  return (
    <div aria-busy={busy}>
      <div
        className={cn(
          "relative flex items-center justify-center",
          shell,
          success ? galleryAnimate.seal : galleryAnimate.scaleIn,
          className
        )}
        style={style}
      >
        {progress ? (
          <svg
            className="absolute inset-0 size-full -rotate-90"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary/15"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="283"
              strokeDashoffset="283"
              className="text-primary motion-safe:animate-[luminous-hold-ring_1.6s_ease-in-out_infinite]"
            />
          </svg>
        ) : (
          <div
            className={cn(
              "absolute inset-0 rounded-full border",
              success ? "border-success/30" : "border-primary/30",
              showPulse &&
                "motion-safe:animate-[gallery-pulse_1.6s_ease-out_infinite]"
            )}
          />
        )}
        <div
          className={cn(
            "relative overflow-hidden rounded-full",
            artSize,
            showArt
              ? "bg-muted/40 shadow-[0_8px_32px_-8px_var(--card-shadow)]"
              : success
              ? "flex items-center justify-center bg-success/15 text-success"
              : "flex items-center justify-center bg-primary/15 text-primary",
            busy && showArt && "opacity-70"
          )}
        >
          {busy && !progress ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
              <Spinner className={cn(icon, "animate-spin text-foreground")} />
            </div>
          ) : null}
          {success && !showArt ? (
            <CheckCircle2 className={icon} />
          ) : showArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src!}
              alt={alt}
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setFailedSrc(src!)}
            />
          ) : (
            <RevibaseMark variant="digital" className={icon} />
          )}
        </div>
      </div>
    </div>
  );
}
