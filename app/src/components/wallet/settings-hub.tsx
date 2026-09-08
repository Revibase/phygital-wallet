"use client";

import { useMemo } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useWalletPolicy } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import { settingsHubClass } from "@/lib/layout";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import type { WalletRole } from "@/components/token/token-address-route";
import { summarizePolicyDocument } from "@/lib/wallet/policy-settings";

export type SettingsTarget =
  | "sendProtections"
  | "spendingLimits"
  | "recipients"
  | "extraPrograms"
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
}: {
  onBack: () => void;
  onOpen: (target: SettingsTarget) => void;
  phygitalTokenPda?: string;
  role?: WalletRole;
  linkStatus?: LinkStatus;
  claimed?: boolean;
}) {
  const fee = useFeeBalance(phygitalTokenPda ?? null);
  const rpc = useRpcPreference();
  const isOwner = role === "owner";
  const policy = useWalletPolicy(
    isOwner && phygitalTokenPda ? phygitalTokenPda : null,
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
    if (
      summary &&
      summary !== "invalid" &&
      summary.unrestrictedApps > 0
    ) {
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
                : copy.wallet.limitsStatusOff,
            );

  const recipientsSubtitle = !isOwner
    ? undefined
    : policy.isLoading
      ? copy.common.loading
      : summary === "invalid"
        ? copy.wallet.limitsStatusInvalid
        : !protectionsOn
          ? copy.wallet.sendProtectionsOff
          : withExceptionsHint(
              summary.recipientAllowlist
                ? copy.wallet.recipientsAllowlist
                : copy.wallet.recipientsAnyone,
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
            ? copy.wallet.extraProgramsWithUnrestricted(
                summary.unrestrictedApps,
              )
            : copy.wallet.extraProgramsBuiltIn;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.settings}
      />

      <div className={settingsHubClass}>
        <GroupedList label={copy.wallet.settingsAccess}>
          <GroupedRow
            onClick={() => onOpen("access")}
            subtitle={accessSubtitle}
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
          >
            {copy.wallet.feeBalance}
          </GroupedRow>
        </GroupedList>

        {isOwner ? (
          <GroupedList
            label={copy.wallet.settingsSendProtections}
            footer={copy.wallet.policyDefaultSigningOnly}
            className="lg:col-span-2"
          >
            <GroupedRow
              onClick={() => onOpen("sendProtections")}
              subtitle={masterSubtitle}
            >
              {copy.wallet.sendProtections}
            </GroupedRow>
            {protectionsOn ? (
              <>
                <GroupedRow
                  onClick={() => onOpen("spendingLimits")}
                  subtitle={spendSubtitle}
                >
                  {copy.wallet.spendingLimits}
                </GroupedRow>
                <GroupedRow
                  onClick={() => onOpen("recipients")}
                  subtitle={recipientsSubtitle}
                >
                  {copy.wallet.recipients}
                </GroupedRow>
                <GroupedRow
                  onClick={() => onOpen("extraPrograms")}
                  subtitle={exceptionsSubtitle}
                >
                  {copy.wallet.extraPrograms}
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
            >
              {copy.wallet.signing}
            </GroupedRow>
            <GroupedRow
              onClick={() => onOpen("recoveryWallet")}
              subtitle={copy.wallet.recoveryWalletNotConfigured}
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
          >
            {copy.wallet.rpcConnection}
          </GroupedRow>
        </GroupedList>
      </div>
    </div>
  );
}
