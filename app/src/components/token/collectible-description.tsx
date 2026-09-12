"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { cn } from "@/lib/utils";

/** Clamped collectible description with expand. */
export function CollectibleDescription({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = description.length > 180 || description.split("\n").length > 4;

  return (
    <section className={cn("w-full text-left", className)}>
      <h2 className="text-eyebrow text-muted-foreground">{copy.token.about}</h2>
      <p
        className={cn(
          "mt-2 text-sm leading-6 text-foreground/90 whitespace-pre-wrap",
          !expanded && long && "line-clamp-4"
        )}
      >
        {description}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          className="mt-1.5 h-auto min-h-0 px-0 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? copy.token.showLess : copy.token.showMore}
        </Button>
      ) : null}
    </section>
  );
}
