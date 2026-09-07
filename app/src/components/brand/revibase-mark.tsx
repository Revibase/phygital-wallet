import { cn } from "@/lib/utils";

/** Geometric Revibase monogram path (viewBox 0 0 100 100). */
const REVIBASE_MARK_PATH =
  "M8 17.54 L22.77 42.56 L30.11 30.16 L47.14 30.16 L16.3 82.46 L30.97 82.46 L38.62 69.52 L46.39 82.46 L61.16 82.46 L92 30.27 L84.78 17.54 L69.57 17.54 L77.01 30.81 L53.61 69.95 L46.06 56.79 L61.81 30.37 L54.69 17.54 Z";

/** Geometric Revibase monogram — fill follows `currentColor`. */
export function RevibaseMark({
  className,
  title,
}: {
  className?: string;
  /** Accessible name when the mark stands alone. Omit when adjacent text names the brand. */
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="currentColor"
      className={cn("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={REVIBASE_MARK_PATH} />
    </svg>
  );
}
