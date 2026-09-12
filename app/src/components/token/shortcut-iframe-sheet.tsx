"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";

import { ModalSheet } from "@/components/shared/modal-sheet";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { openShortcutExternal } from "@/lib/tokens/open-shortcut";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const LOAD_TIMEOUT_MS = 12_000;

/** Full-screen in-app iframe for same-origin shortcuts (`prefersExternalTarget: false`). */
export function ShortcutIframeSheet({
  open,
  uri,
  label,
  onClose,
}: {
  open: boolean;
  uri: string;
  label: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setBlocked(false);
      clearTimer();
      return;
    }

    setLoaded(false);
    setBlocked(false);
    timerRef.current = setTimeout(() => {
      setBlocked(true);
    }, LOAD_TIMEOUT_MS);

    return clearTimer;
  }, [open, uri, clearTimer]);

  const onLoad = useCallback(() => {
    clearTimer();
    setLoaded(true);
    setBlocked(false);
  }, [clearTimer]);

  const onOpenExternal = useCallback(() => {
    openShortcutExternal(uri);
  }, [uri]);

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={label}
      className="max-w-none p-0 sm:max-w-3xl"
      align="bottom"
    >
      <div
        className={cn(
          "flex h-[min(92dvh,48rem)] w-full flex-col",
          "rounded-t-2xl border border-border/60 bg-background shadow-xl sm:rounded-2xl"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            {label}
          </p>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label={copy.common.close}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="relative min-h-0 flex-1 bg-muted/20">
          {!loaded && !blocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Spinner className="size-6" aria-hidden />
              <p className="text-xs">{copy.shortcut.loading}</p>
            </div>
          ) : null}

          {blocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                {copy.shortcut.embedBlocked}
              </p>
              <Button type="button" variant="default" onClick={onOpenExternal}>
                {copy.shortcut.openInBrowser}
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <iframe
              title={label}
              src={uri}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              className={cn("size-full border-0", !loaded && "opacity-0")}
              onLoad={onLoad}
            />
          )}
        </div>
      </div>
    </ModalSheet>
  );
}
