"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { SettingsHub } from "@/components/wallet/settings-hub";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { settingsDesktopClass, walletFormColumnClass } from "@/lib/layout";
import { settingsTargetFromPathname } from "@/lib/wallet/token-routes";

/**
 * Hub (`/settings`): children fill the main pane.
 * Detail (`/settings/…`): desktop master–detail — compact index + form.
 */
export default function WalletSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { tokenAddress } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();
  const activeTarget = settingsTargetFromPathname(pathname);

  if (activeTarget === null) {
    return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <div className={settingsDesktopClass}>
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <SettingsHub
          variant="panel"
          phygitalTokenPda={tokenAddress}
          activeTarget={activeTarget}
          onBack={backHome}
          onOpen={(target) => goSettings(target)}
        />
      </aside>
      <div className={walletFormColumnClass}>{children}</div>
    </div>
  );
}
