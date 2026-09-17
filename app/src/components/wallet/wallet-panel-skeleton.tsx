import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LIST_ROWS = [
  "wallet-skel-1",
  "wallet-skel-2",
  "wallet-skel-3",
  "wallet-skel-4",
] as const;

/** Shared loading placeholder for wallet chrome panes (home / lists / boot). */
export function WalletPanelSkeleton({
  variant = "list",
  className,
}: {
  variant?: "list" | "home" | "detail";
  className?: string;
}) {
  if (variant === "home") {
    return (
      <div
        className={cn("flex flex-1 flex-col gap-6", className)}
        role="status"
        aria-busy
      >
        <div className="flex flex-col items-center gap-2 py-1 text-center lg:items-start lg:text-left">
          <Skeleton className="h-10 w-44 rounded-2xl" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="size-12 rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="size-12 rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
          <Skeleton className="size-9 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="mx-4 h-3 w-16" />
          <div className="overflow-hidden rounded-2xl bg-grouped">
            {LIST_ROWS.slice(0, 3).map((key) => (
              <Skeleton key={key} className="h-14 rounded-none bg-muted/20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div
        className={cn("flex flex-1 flex-col gap-6", className)}
        role="status"
        aria-busy
      >
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <Skeleton className="aspect-square w-full max-w-sm rounded-3xl lg:max-w-none" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48 rounded-xl" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full max-w-sm rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-2xl bg-grouped", className)}
      role="status"
      aria-busy
    >
      {LIST_ROWS.map((key) => (
        <Skeleton key={key} className="h-14 rounded-none bg-muted/20" />
      ))}
    </div>
  );
}
