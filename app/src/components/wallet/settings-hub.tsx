"use client";

import { useIsRestoring } from "@tanstack/react-query";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { OwnerOwnershipSection } from "@/components/wallet/owner-ownership-section";
import { policyHubLimitedSubtitle } from "@/components/wallet/policy-status-view";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useWalletPolicy } from "@/hooks/token/use-wallet-policy";
import { useWalletSessionMode } from "@/hooks/wallet/use-wallet-session-mode";
import { copy } from "@/lib/copy/phygital";
import {
  settingsHubClass,
  settingsPanelListClass,
  walletContentColumnClass,
  walletDesktopTitleClass,
} from "@/lib/layout";
import { cn } from "@/lib/utils";

export type SettingsTarget = "rpcConnection" | "feeBalance" | "walletPolicy";

export function SettingsHub({
  onBack,
  onOpen,
  phygitalTokenPda,
  variant = "page",
  activeTarget = null,
}: {
  onBack: () => void;
  onOpen: (target: SettingsTarget) => void;
  phygitalTokenPda?: string;
  /** `panel` = desktop master list (no top back bar). */
  variant?: "page" | "panel";
  activeTarget?: SettingsTarget | null;
}) {
  const restoring = useIsRestoring();
  const fee = useFeeBalance(phygitalTokenPda ?? null);
  const rpc = useRpcPreference();
  const policy = useWalletPolicy(phygitalTokenPda ?? null);
  const session = useWalletSessionMode(phygitalTokenPda ?? null);
  const feeSubtitle =
    restoring || !fee.data
      ? copy.common.loading
      : `${fee.data.balanceUi} SOL`;
  const rpcSubtitle = rpc.isCustom
    ? copy.wallet.rpcCustom
    : copy.wallet.rpcDefault;
  const policySubtitle =
    restoring || policy.isLoading
      ? copy.common.loading
      : policy.data?.status === "none"
        ? copy.wallet.policyHubLocked
        : policy.data?.status === "limited"
          ? policyHubLimitedSubtitle(policy.data)
          : policy.data?.status === "open"
            ? copy.wallet.policyHubOpen
            : copy.wallet.policyHubStandard;
  const approveWith =
    session.data === "owner"
      ? copy.wallet.approveWithPhone
      : session.data === "accessory"
        ? copy.wallet.approveWithAccessory
        : null;

  function rowClass(target: SettingsTarget) {
    return cn(
      activeTarget === target &&
        "bg-muted/60 font-medium text-foreground hover:bg-muted/70",
    );
  }

  const lists = (
    <div
      className={
        variant === "panel" ? settingsPanelListClass : settingsHubClass
      }
    >
      <GroupedList label={copy.wallet.settingsPermissions}>
        {approveWith ? (
          <GroupedRow subtitle={approveWith}>
            {copy.wallet.approveSendsWith}
          </GroupedRow>
        ) : null}
        <GroupedRow
          onClick={() => onOpen("walletPolicy")}
          subtitle={policySubtitle}
          className={rowClass("walletPolicy")}
        >
          {copy.wallet.policy}
        </GroupedRow>
      </GroupedList>

      <GroupedList label={copy.wallet.settingsFees}>
        <GroupedRow
          onClick={() => onOpen("feeBalance")}
          subtitle={
            fee.data?.low
              ? `${feeSubtitle} · ${copy.wallet.topUpFees}`
              : feeSubtitle
          }
          className={rowClass("feeBalance")}
        >
          {copy.wallet.feeBalance}
        </GroupedRow>
      </GroupedList>

      <GroupedList label={copy.wallet.advanced}>
        <GroupedRow
          onClick={() => onOpen("rpcConnection")}
          subtitle={
            rpc.isCustom && rpc.displayEndpoint
              ? rpc.displayEndpoint
              : rpcSubtitle
          }
          className={rowClass("rpcConnection")}
        >
          {copy.wallet.rpcConnection}
        </GroupedRow>
      </GroupedList>

      {phygitalTokenPda ? (
        <OwnerOwnershipSection phygitalTokenPda={phygitalTokenPda} />
      ) : null}
    </div>
  );

  if (variant === "panel") {
    return lists;
  }

  return (
    <div className={walletContentColumnClass}>
      <NavBar
        desktopHidden
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.settings}
      />
      <h1 className={walletDesktopTitleClass}>{copy.wallet.settings}</h1>
      {lists}
    </div>
  );
}
