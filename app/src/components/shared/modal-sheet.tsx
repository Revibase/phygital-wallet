"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { copy } from "@/lib/copy/phygital";
import { galleryAnimate } from "@/lib/motion";
import { shellLayoutClass } from "@/lib/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Shared modal / bottom sheet with focus trap and scroll lock. */
export function ModalSheet({
  open,
  onClose,
  title,
  children,
  className,
  align = "bottom",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  align?: "bottom" | "center";
  labelledBy?: string;
}) {
  const autoTitleId = useId();
  const titleId = labelledBy ?? (title ? autoTitleId : undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portal past card/gallery transforms so `fixed` is viewport-relative.
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
        "p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        align === "bottom" ? "items-end lg:items-center" : "items-center"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={copy.common.close}
        className={cn(
          "absolute inset-0 h-auto min-h-0 rounded-none border-0 bg-background/80 p-0 backdrop-blur-sm hover:bg-background/80",
          galleryAnimate.fade
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 w-full",
          shellLayoutClass.compact,
          galleryAnimate.rise,
          className
        )}
      >
        {title ? (
          <p id={autoTitleId} className="sr-only">
            {title}
          </p>
        ) : null}
        {children}
      </div>
    </div>,
    document.body
  );
}
