"use client";

import { useState } from "react";

import { resolveTokenIconSrc } from "@/lib/tokens/payment-token";
import { cn } from "@/lib/utils";

export function TokenIcon({
  token,
  size = "md",
  className,
}: {
  token: {
    mint: string;
    symbol: string;
    icon: string | null;
  };
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const dim = size === "xs" ? "size-4" : size === "sm" ? "size-6" : "size-8";
  const letter = size === "xs" ? "text-[8px]" : "text-[10px]";
  const src = resolveTokenIconSrc(token.mint, token.icon);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={cn(
          dim,
          "shrink-0 rounded-full bg-muted object-cover",
          className
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        dim,
        letter,
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold uppercase text-muted-foreground",
        className
      )}
      aria-hidden
    >
      {token.symbol.slice(0, 2)}
    </span>
  );
}
