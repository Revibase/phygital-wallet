import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "w-full min-w-0 rounded-xl border border-border/60 bg-clip-padding text-foreground outline-none transition-all duration-150 ease-out placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive/50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:focus-visible:ring-ring/40",
  {
    variants: {
      variant: {
        default: "bg-background/60 dark:bg-input/30",
        muted: "border-border/60 bg-muted/30",
        hero: "h-auto min-h-0 border-transparent bg-transparent px-0 text-center font-(family-name:--font-display) text-[2.75rem] leading-none tracking-tight tabular-nums placeholder:text-muted-foreground/40 focus-visible:border-transparent focus-visible:ring-0 dark:focus-visible:ring-0 md:text-5xl",
      },
      size: {
        // 16px / 44pt — Safari zooms any focused control below 16px; HIG min hit target is 44pt.
        default: "h-11 min-h-11 px-4 text-base",
        sm: "h-11 min-h-11 px-3.5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & VariantProps<typeof inputVariants>
>(function Input({ className, variant, size, type = "text", ...props }, ref) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      data-size={size}
      className={cn(
        inputVariants({
          variant,
          size: variant === "hero" ? null : size,
        }),
        className,
        // Keep computed size ≥ 16px so iOS does not zoom on focus (callers may pass text-xs).
        variant !== "hero" && "text-[max(1rem,16px)]",
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} {...props} />
  );
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-destructive", className)} {...props} />;
}

export { Input, inputVariants, FieldLabel, FieldHint, FieldError };
