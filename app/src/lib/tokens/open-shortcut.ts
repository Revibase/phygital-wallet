"use client";

import {
  resolveShortcutUri,
  shortcutOpensExternally,
  type CollectibleShortcut,
  type ShortcutUriContext,
} from "@/lib/tokens/shortcuts";

export function openShortcutExternal(resolvedUri: string): void {
  window.open(resolvedUri, "_blank", "noopener,noreferrer");
}

export type OpenShortcutInput = {
  shortcut: CollectibleShortcut;
  ctx: ShortcutUriContext;
  onIframe: (resolvedUri: string, label: string) => void;
};

/**
 * Central open path for sticky CTA + shortcut chips.
 * External when `prefersExternalTarget` (or `solana:`); else iframe sheet.
 */
export function openShortcut({
  shortcut,
  ctx,
  onIframe,
}: OpenShortcutInput): void {
  const resolvedUri = resolveShortcutUri(shortcut.uri, ctx);
  if (shortcutOpensExternally(shortcut)) {
    openShortcutExternal(resolvedUri);
    return;
  }
  onIframe(resolvedUri, shortcut.label);
}
