"use client";

import { useState } from "react";

import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Full-width square NFT media — DAS image only, wallet-style cover. */
export function CollectibleHero({
  src,
  alt,
  fallbackLabel,
  loading = false,
  reveal = false,
  className,
}: {
  src: string | null;
  alt: string;
  fallbackLabel?: string;
  loading?: boolean;
  reveal?: boolean;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;
  const showImage = !loading && !failed && src;

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-card-frame bg-muted/40",
        "aspect-square shadow-[0_12px_40px_-16px_var(--card-shadow)]",
        reveal && galleryAnimate.reveal,
        className,
      )}
    >
      {loading ? (
        <div
          className={cn(
            "size-full bg-linear-to-r from-muted/30 via-muted/60 to-muted/30 bg-size-[200%_100%]",
            galleryAnimate.shimmer,
          )}
          aria-hidden
        />
      ) : showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="size-full object-cover motion-safe:animate-[gallery-fade_0.22s_ease-out_both]"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/50 px-4">
          <span className="text-center text-sm font-medium text-muted-foreground">
            {fallbackLabel ?? alt}
          </span>
        </div>
      )}
    </div>
  );
}
