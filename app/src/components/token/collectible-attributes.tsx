"use client";

import { copy } from "@/lib/copy/phygital";
import type { CollectibleAttribute } from "@/lib/tokens/collectible";
import { cn } from "@/lib/utils";

/** Two-column trait grid — Phantom/Backpack style. */
export function CollectibleAttributes({
  attributes,
  className,
}: {
  attributes: CollectibleAttribute[];
  className?: string;
}) {
  if (attributes.length === 0) return null;

  return (
    <section className={cn("w-full text-left", className)}>
      <h2 className="text-eyebrow text-muted-foreground">{copy.token.attributes}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {attributes.map((attr) => (
          <li
            key={`${attr.traitType}:${attr.value}`}
            className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2.5"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {attr.traitType}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {attr.value}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
