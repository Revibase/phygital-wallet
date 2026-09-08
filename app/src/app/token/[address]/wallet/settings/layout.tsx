"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { SettingsHub } from "@/components/wallet/settings-hub";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { settingsDesktopClass } from "@/lib/layout";
import { settingsFromSegment } from "@/lib/wallet/token-routes";

/** Desktop: sticky settings index + detail. Mobile: children only (full pages). */
export default function WalletSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { tokenAddress, role, linkStatus, claimed } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();

  const segment = pathname.split("/").pop() ?? "";
  const activeTarget =
    segment === "settings" ? null : settingsFromSegment(segment);

  return (
    <div className={settingsDesktopClass}>
      <aside className="hidden lg:block lg:sticky lg:top-4">
        <SettingsHub
          variant="panel"
          phygitalTokenPda={tokenAddress}
          role={role}
          linkStatus={linkStatus}
          claimed={claimed}
          activeTarget={activeTarget}
          onBack={backHome}
          onOpen={(target) => goSettings(target)}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:max-w-xl">{children}</div>
    </div>
  );
}
