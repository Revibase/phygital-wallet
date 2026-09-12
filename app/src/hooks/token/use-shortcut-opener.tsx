"use client";

import { useCallback, useState } from "react";

import { ShortcutIframeSheet } from "@/components/token/shortcut-iframe-sheet";
import { openShortcut } from "@/lib/tokens/open-shortcut";
import type {
  CollectibleShortcut,
  ShortcutUriContext,
} from "@/lib/tokens/shortcuts";

type IframeState = {
  uri: string;
  label: string;
} | null;

/** Shared shortcut open state — iframe sheet + external popup routing. */
export function useShortcutOpener() {
  const [iframe, setIframe] = useState<IframeState>(null);

  const closeIframe = useCallback(() => setIframe(null), []);

  const openCollectibleShortcut = useCallback(
    (shortcut: CollectibleShortcut, ctx: ShortcutUriContext) => {
      openShortcut({
        shortcut,
        ctx,
        onIframe: (resolvedUri, label) => {
          setIframe({ uri: resolvedUri, label });
        },
      });
    },
    []
  );

  const iframeSheet = iframe ? (
    <ShortcutIframeSheet
      open
      uri={iframe.uri}
      label={iframe.label}
      onClose={closeIframe}
    />
  ) : null;

  return { openCollectibleShortcut, iframeSheet };
}
