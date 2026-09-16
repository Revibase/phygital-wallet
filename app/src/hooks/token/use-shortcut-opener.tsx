"use client";

import { useCallback, useState } from "react";

import { ShortcutIframeDialog } from "@/components/token/shortcut-iframe-dialog";
import { openShortcut } from "@/lib/tokens/open-shortcut";
import type {
  CollectibleShortcut,
  ShortcutUriContext,
} from "@/lib/tokens/shortcuts";

type IframeState = {
  uri: string;
  label: string;
} | null;

/** Shared shortcut open state — iframe dialog + external popup routing. */
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

  const iframeDialog = iframe ? (
    <ShortcutIframeDialog
      open
      uri={iframe.uri}
      label={iframe.label}
      onClose={closeIframe}
    />
  ) : null;

  return { openCollectibleShortcut, iframeDialog };
}
