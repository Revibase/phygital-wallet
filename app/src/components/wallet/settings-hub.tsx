"use client";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { OwnerOwnershipSection } from "@/components/wallet/owner-ownership-section";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useWalletPolicy } from "@/hooks/token/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { settingsHubClass, settingsPanelListClass } from "@/lib/layout";
import { cn } from "@/lib/utils";

export type SettingsTarget = "rpcConnection" | "feeBalance" | "walletPolicy";

/** Wallet settings hub — Access / Fees / Advanced. */
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
  const fee = useFeeBalance(phygitalTokenPda ?? null);
  const rpc = useRpcPreference();
  const policy = useWalletPolicy(phygitalTokenPda ?? null);
  const feeSubtitle = fee.data
    ? `${fee.data.balanceUi} SOL`
    : copy.common.loading;
  const rpcSubtitle = rpc.isCustom
    ? copy.wallet.rpcCustom
    : copy.wallet.rpcDefault;
  const policySubtitle = policy.isLoading
    ? copy.common.loading
    : policy.data?.status === "limited"
      ? copy.wallet.policyAssetsSummary(
          policy.data.mintCaps.length + (policy.data.solCap ? 1 : 0),
        )
      : policy.data?.status === "open"
        ? copy.wallet.policyHubOpen
        : copy.wallet.policyHubStandard;

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

      <GroupedList label={copy.wallet.settingsSafety}>
        <GroupedRow
          onClick={() => onOpen("walletPolicy")}
          subtitle={policySubtitle}
          className={rowClass("walletPolicy")}
        >
          {copy.wallet.policy}
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
    return <div className="flex flex-col gap-1">{lists}</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        desktopHidden
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.settings}
      />
      <h1 className="hidden text-display-md tracking-tight lg:block">
        {copy.wallet.settings}
      </h1>
      {lists}
    </div>
  );
}
