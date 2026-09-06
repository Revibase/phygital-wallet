"use client";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { useFeeBalance } from "@/hooks/wallet/use-fee-balance";
import {
  recoveryWalletSubtitle,
  useRecoveryWallet,
} from "@/hooks/wallet/use-recovery-wallet";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { useTokenVerifier } from "@/hooks/wallet/use-token-verifier";
import { useWalletPolicy } from "@/hooks/wallet/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";
import type { LinkStatus } from "@/lib/wallet/device-auth-client";
import type { WalletRole } from "@/components/token/token-address-route";

export type SettingsTarget =
  | "spendingLimits"
  | "recipients"
  | "extraPrograms"
  | "signing"
  | "recoveryWallet"
  | "rpcConnection"
  | "feeBalance"
  | "access"
  | "contacts";

/** Wallet settings hub — Access / Money / Safety / Advanced. */
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

  const limitsSubtitle = !isOwner
    ? linkStatus === "linked_elsewhere"
      ? copy.wallet.setupDeviceLinkedElsewhere
      : claimed === true
        ? copy.wallet.setupDeviceSignIn
        : copy.wallet.limitsStatusRequiresClaim
    : policy.isLoading
      ? copy.common.loading
      : policy.data?.status === "invalid"
        ? copy.wallet.limitsStatusInvalid
        : policy.data?.status === "ok"
          ? copy.wallet.limitsStatusOn
          : copy.wallet.limitsStatusOff;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.settings}
      />

      <GroupedList label={copy.wallet.settingsAccess}>
        <GroupedRow
          onClick={() => onOpen("access")}
          subtitle={accessSubtitle}
        >
          {copy.wallet.accessAndRecovery}
        </GroupedRow>
      </GroupedList>

      <GroupedList label={copy.wallet.settingsMoney}>
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
        <GroupedRow onClick={() => onOpen("contacts")}>
          {copy.wallet.contacts}
        </GroupedRow>
        <GroupedRow
          onClick={() => onOpen("spendingLimits")}
          subtitle={limitsSubtitle}
        >
          {copy.wallet.spendingLimits}
        </GroupedRow>
      </GroupedList>

      {isOwner ? (
        <GroupedList
          label={copy.wallet.settingsSafety}
          footer={copy.wallet.policyDefaultSigningOnly}
        >
          <GroupedRow onClick={() => onOpen("recipients")}>
            {copy.wallet.recipients}
          </GroupedRow>
          <GroupedRow onClick={() => onOpen("extraPrograms")}>
            {copy.wallet.extraPrograms}
          </GroupedRow>
          <SigningSettingsRow
            phygitalTokenPda={phygitalTokenPda}
            onOpen={() => onOpen("signing")}
          />
          <RecoverySettingsRow
            phygitalTokenPda={phygitalTokenPda}
            onOpen={() => onOpen("recoveryWallet")}
          />
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
  );
}

function RecoverySettingsRow({
  phygitalTokenPda,
  onOpen,
}: {
  phygitalTokenPda?: string;
  onOpen: () => void;
}) {
  const recovery = useRecoveryWallet(phygitalTokenPda ?? null);

  return (
    <GroupedRow
      onClick={onOpen}
      subtitle={recoveryWalletSubtitle(recovery.data, recovery.isLoading)}
    >
      {copy.wallet.recoveryWallet}
    </GroupedRow>
  );
}

function SigningSettingsRow({
  phygitalTokenPda,
  onOpen,
}: {
  phygitalTokenPda?: string;
  onOpen: () => void;
}) {
  const verifier = useTokenVerifier(phygitalTokenPda ?? null);
  const subtitle = verifier.isLoading
    ? copy.common.loading
    : verifier.data?.custom
      ? copy.wallet.signingCustom
      : copy.wallet.signingDefault;

  return (
    <GroupedRow onClick={onOpen} subtitle={subtitle}>
      {copy.wallet.signing}
    </GroupedRow>
  );
}
