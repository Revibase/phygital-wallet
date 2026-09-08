"use client";

import { SettingsHub } from "@/components/wallet/settings-hub";
import {
  useWalletNav,
  useWalletSession,
} from "@/components/wallet/wallet-route-shell";
import { copy } from "@/lib/copy/phygital";

export default function WalletSettingsPage() {
  const { tokenAddress, role, linkStatus, claimed } = useWalletSession();
  const { backHome, goSettings } = useWalletNav();

  return (
    <>
      <div className="lg:hidden">
        <SettingsHub
          phygitalTokenPda={tokenAddress}
          role={role}
          linkStatus={linkStatus}
          claimed={claimed}
          onBack={backHome}
          onOpen={(target) => goSettings(target)}
        />
      </div>
      <div className="hidden min-h-[20rem] flex-1 flex-col items-start justify-center gap-2 px-2 lg:flex">
        <p className="text-display-md tracking-tight text-foreground">
          {copy.wallet.settings}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {copy.wallet.settingsDesktopHint}
        </p>
      </div>
    </>
  );
}
