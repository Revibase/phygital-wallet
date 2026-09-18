"use client";

import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/lib/copy/phygital";
import { centeredBlockClass } from "@/lib/layout";
import { cn } from "@/lib/utils";

export function LoadingStatus({
  label = copy.common.loading,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn(centeredBlockClass, className)}>
      <Spinner className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
