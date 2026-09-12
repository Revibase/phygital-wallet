"use client";

import { useMemo } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useWalletPolicy } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { settingsHubClass, settingsPanelListClass } from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import type { WalletRole } from "@/components/token/token-address-route";
import { summarizePolicyDocument } from "@/lib/wallet/policy-settings";

export type SettingsTarget =
  | "sendProtections"
  | "spendingLimits"
  | "extraPrograms"
  | "allowedOrigins"
  | "signing"
  | "recoveryWallet"
  | "rpcConnection"
  | "feeBalance"
  | "access";

/** Wallet settings hub — Access / Money / Send protections / Safety / Advanced. */
export function SettingsHub({
  onBack,
  onOpen,
  phygitalTokenPda,
  role = "visitor",
  linkStatus,
  claimed,
  variant = "page",
  activeTarget = null,
}: {
  onBack: () => void;
  onOpen: (target: SettingsTarget) => void;
  phygitalTokenPda?: string;
  role?: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
  /** `panel` = desktop master list (no top back bar). */
  variant?: "page" | "panel";
  activeTarget?: SettingsTarget | null;
}) {
  const fee = useFeeBalance(phygitalTokenPda ?? null);
  const rpc = useRpcPreference();
  const isOwner = role === "owner";
  const policy = useWalletPolicy(
    isOwner && phygitalTokenPda ? phygitalTokenPda : null
  );
  const feeSubtitle = fee.data
    ? `${fee.data.balanceUi} SOL`
    : copy.common.loading;
  const rpcSubtitle = rpc.isCustom
    ? copy.wallet.rpcCustom
    : copy.wallet.rpcDefault;

  const accessSubtitle =
    linkStatus === "linked_here"
      ? copy.wallet.setupDeviceLinkedHere
      : linkStatus === "linked_elsewhere"
      ? copy.wallet.setupDeviceLinkedElsewhere
      : claimed === true
      ? copy.wallet.setupDeviceSignIn
      : copy.wallet.setupDeviceNotLinked;

  const summary = useMemo(() => {
    if (!isOwner || policy.isLoading) return null;
    if (policy.data?.status === "invalid") return "invalid" as const;
    if (policy.data?.status !== "ok" || !policy.data.policy) return null;
    return summarizePolicyDocument(policy.data.policy);
  }, [isOwner, policy.isLoading, policy.data]);

  const protectionsOn = summary != null && summary !== "invalid";

  const visitorLimitsSubtitle =
    linkStatus === "linked_elsewhere"
      ? copy.wallet.setupDeviceLinkedElsewhere
      : claimed === true
      ? copy.wallet.setupDeviceSignIn
      : copy.wallet.limitsStatusRequiresClaim;

  function withExceptionsHint(base: string): string {
    if (summary && summary !== "invalid" && summary.unrestrictedApps > 0) {
      return `${base} · ${copy.wallet.unrestrictedAppsHint}`;
    }
    return base;
  }

  const masterSubtitle = !isOwner
    ? undefined
    : policy.isLoading
    ? copy.common.loading
    : summary === "invalid"
    ? copy.wallet.limitsStatusInvalid
    : protectionsOn
    ? withExceptionsHint(copy.wallet.sendProtectionsOn)
    : copy.wallet.sendProtectionsOff;

  const spendSubtitle = !isOwner
    ? visitorLimitsSubtitle
    : policy.isLoading
    ? copy.common.loading
    : summary === "invalid"
    ? copy.wallet.limitsStatusInvalid
    : !protectionsOn
    ? copy.wallet.sendProtectionsOff
    : withExceptionsHint(
        summary.spendCaps
          ? copy.wallet.limitsStatusOn
          : copy.wallet.limitsStatusOff
      );

  const exceptionsSubtitle = !isOwner
    ? undefined
    : policy.isLoading
    ? copy.common.loading
    : summary === "invalid"
    ? copy.wallet.limitsStatusInvalid
    : !protectionsOn
    ? copy.wallet.extraProgramsAllAllowed
    : summary.unrestrictedApps > 0
    ? copy.wallet.extraProgramsWithUnrestricted(summary.unrestrictedApps)
    : copy.wallet.extraProgramsBuiltIn;

  const allowedSitesSubtitle = !isOwner
    ? undefined
    : policy.isLoading
    ? copy.common.loading
    : summary === "invalid"
    ? copy.wallet.limitsStatusInvalid
    : summary && summary.allowedOrigins > 0
    ? copy.wallet.allowedSitesStatusOn(summary.allowedOrigins)
    : copy.wallet.allowedSitesStatusAny;

  function rowClass(target: SettingsTarget) {
    return cn(
      activeTarget === target &&
        "bg-muted/60 font-medium text-foreground hover:bg-muted/70"
    );
  }

  const lists = (
    <div
      className={
        variant === "panel" ? settingsPanelListClass : settingsHubClass
      }
    >
      <GroupedList label={copy.wallet.settingsAccess}>
        <GroupedRow
          onClick={() => onOpen("access")}
          subtitle={accessSubtitle}
          className={rowClass("access")}
        >
          {copy.wallet.accessAndRecovery}
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

      {isOwner ? (
        <GroupedList
          label={copy.wallet.settingsSendProtections}
          footer={copy.wallet.policyDefaultSigningOnly}
          className={variant === "page" ? "lg:col-span-2" : undefined}
        >
          <GroupedRow
            onClick={() => onOpen("sendProtections")}
            subtitle={masterSubtitle}
            className={rowClass("sendProtections")}
          >
            {copy.wallet.sendProtections}
          </GroupedRow>
          {protectionsOn ? (
            <>
              <GroupedRow
                onClick={() => onOpen("spendingLimits")}
                subtitle={spendSubtitle}
                className={rowClass("spendingLimits")}
              >
                {copy.wallet.spendingLimits}
              </GroupedRow>
              <GroupedRow
                onClick={() => onOpen("extraPrograms")}
                subtitle={exceptionsSubtitle}
                className={rowClass("extraPrograms")}
              >
                {copy.wallet.extraPrograms}
              </GroupedRow>
              <GroupedRow
                onClick={() => onOpen("allowedOrigins")}
                subtitle={allowedSitesSubtitle}
                className={rowClass("allowedOrigins")}
              >
                {copy.wallet.allowedSites}
              </GroupedRow>
            </>
          ) : null}
        </GroupedList>
      ) : null}

      {isOwner ? (
        <GroupedList label={copy.wallet.settingsSafety}>
          <GroupedRow
            onClick={() => onOpen("signing")}
            subtitle={copy.wallet.signingDefault}
            className={rowClass("signing")}
          >
            {copy.wallet.signing}
          </GroupedRow>
          <GroupedRow
            onClick={() => onOpen("recoveryWallet")}
            subtitle={copy.wallet.recoveryWalletNotConfigured}
            className={rowClass("recoveryWallet")}
          >
            {copy.wallet.recoveryWallet}
          </GroupedRow>
        </GroupedList>
      ) : null}

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
