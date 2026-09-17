"use client";

import { useState } from "react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { PolicyLimitEditor } from "@/components/wallet/policy-limit-editor";
import { PolicyStatusView } from "@/components/wallet/policy-status-view";
import { useTokenOwner } from "@/hooks/token/use-token-owner";
import { useWalletPolicy } from "@/hooks/token/use-wallet-policy";
import { copy } from "@/lib/copy/phygital";

type Mode = "view" | "edit";

/**
 * Spend-policy panel. Publicly viewable (browse-unlock cookie); editing
 * controls render only when the signed-in owner wallet is this accessory's
 * on-chain authority. Unclaimed accessories show locked — no transactions.
 */
export function WalletPolicyPanel({
  phygitalTokenPda,
  onBack,
}: {
  phygitalTokenPda: string;
  onBack: () => void;
}) {
  const policy = useWalletPolicy(phygitalTokenPda);
  const { isOwner, isSignedIn, isClaimed } = useTokenOwner(phygitalTokenPda);
  const [mode, setMode] = useState<Mode>("view");

  // On desktop the master list already names this setting. Hide the duplicate
  // chrome in view mode so ModeHeader tops the column. Keep it in edit mode
  // for back-to-status.
  const header = (
    <NavBar
      desktopHidden={mode === "view"}
      leading={
        <NavBarBack
          onClick={mode === "edit" ? () => setMode("view") : onBack}
        />
      }
      title={copy.wallet.policy}
    />
  );

  if (mode === "edit" && isOwner) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {header}
        <PolicyLimitEditor
          phygitalTokenPda={phygitalTokenPda}
          solCap={policy.data?.solCap ?? null}
          mintCaps={policy.data?.mintCaps ?? []}
          programPermissions={policy.data?.programPermissions ?? []}
          onDone={() => setMode("view")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {header}
      <PolicyStatusView
        phygitalTokenPda={phygitalTokenPda}
        data={policy.data}
        loading={policy.isLoading}
        isOwner={isOwner}
        isSignedIn={isSignedIn}
        isClaimed={isClaimed}
        onEdit={() => setMode("edit")}
      />
    </div>
  );
}
