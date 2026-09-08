"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PaymentsPolicyConfig } from "phygital-policy";

import { copy } from "@/lib/copy/phygital";
import { applyWalletPolicy, queryKeys, queryOptions } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  deletePaymentsPolicyConfig,
  fetchEffectivePolicy,
  putPaymentsPolicyConfig,
  type EffectivePolicy,
  type PolicyStatus,
} from "@/lib/wallet/policies-client";
import {
  applyPolicySettingsPatch,
  compilePolicySettings,
  derivePolicySettings,
  EMPTY_POLICY_SETTINGS,
  hasStandingPolicyContent,
  hasSpendCaps,
  type PolicySettings,
} from "@/lib/wallet/policy-settings";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";

export function useWalletPolicy(phygitalToken: string | null) {
  return useQuery<EffectivePolicy, Error>({
    queryKey: queryKeys.walletPolicy.byToken(phygitalToken),
    queryFn: () => fetchEffectivePolicy(phygitalToken!),
    enabled: Boolean(phygitalToken),
    ...queryOptions.default,
  });
}

/** PUT compiled document → replace cache. */
export function useSaveWalletPolicy(phygitalToken: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policy: PaymentsPolicyConfig) =>
      putPaymentsPolicyConfig(phygitalToken, policy),
    onSuccess: (effective) => {
      applyWalletPolicy(queryClient, phygitalToken, effective);
    },
  });
}

/** Shared load / derive / save for Settings policy sheets. */
export function usePolicyEditor(phygitalToken: string) {
  const policy = useWalletPolicy(phygitalToken);
  const savePolicy = useSaveWalletPolicy(phygitalToken);
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<PolicySettings | null>(null);

  const turnOffPolicy = useMutation({
    mutationFn: () => deletePaymentsPolicyConfig(phygitalToken),
    onSuccess: (effective) => {
      applyWalletPolicy(queryClient, phygitalToken, effective);
      toast.success(copy.wallet.policyRemoved);
    },
  });

  const status: PolicyStatus | undefined = policy.data?.status;
  const doc = policy.data?.policy ?? null;
  const busy = savePolicy.isPending || turnOffPolicy.isPending;

  useEffect(() => {
    if (policy.isError) toast.error(toUserErrorMessage(policy.error));
  }, [policy.isError, policy.error]);

  useEffect(() => {
    if (policy.isLoading) {
      setSettings(null);
      return;
    }
    if (status === "invalid" || doc == null) {
      setSettings(EMPTY_POLICY_SETTINGS);
      return;
    }
    let cancelled = false;
    void derivePolicySettings(doc).then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, policy.isLoading, status]);

  async function save(patch: Partial<PolicySettings>, onBack: () => void) {
    if (!settings || busy) return;
    try {
      const nextMintLimits =
        patch.mintLimits !== undefined ? patch.mintLimits : settings.mintLimits;
      const nextCapsSol =
        patch.maxTransferSol !== undefined
          ? patch.maxTransferSol
          : settings.maxTransferSol;
      const nextExtras = patch.extraPrograms ?? settings.extraPrograms;
      const merged: PolicySettings = {
        ...settings,
        ...patch,
        mintLimits: nextMintLimits,
        maxTransferSol: nextCapsSol,
        extraPrograms: nextExtras,
        programAllowlist:
          patch.programAllowlist === true ||
          settings.programAllowlist ||
          hasSpendCaps({
            ...settings,
            mintLimits: nextMintLimits,
            maxTransferSol: nextCapsSol,
          }) ||
          nextExtras.length > 0,
      };

      if (!hasStandingPolicyContent(merged)) {
        if (doc == null && status !== "invalid") {
          onBack();
          return;
        }
        await turnOffPolicy.mutateAsync();
        onBack();
        return;
      }

      const next =
        doc == null || status === "invalid"
          ? await compilePolicySettings(merged)
          : await applyPolicySettingsPatch(doc, patch);
      await savePolicy.mutateAsync(next);
      toast.success(copy.wallet.settingsSaved);
      onBack();
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalToken, e)) return;
      toast.error(toUserErrorMessage(e));
    }
  }

  /** Delete entire standing policy (all knobs). */
  async function turnOff(onBack: () => void) {
    if (busy) return;
    try {
      await turnOffPolicy.mutateAsync();
      onBack();
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalToken, e)) return;
      toast.error(toUserErrorMessage(e));
    }
  }

  /** Turn Send protections on — built-in programs only. */
  async function enableProtections(onBack: () => void) {
    if (busy) return;
    await save({ programAllowlist: true }, onBack);
  }

  /**
   * Clear spend caps only. Deletes the document when nothing else remains;
   * otherwise recompiles with null caps so exceptions stay.
   */
  async function clearSpendCaps(onBack: () => void) {
    if (!settings || busy) return;
    await save({ mintLimits: [], maxTransferSol: null }, onBack);
  }

  return {
    policy,
    settings,
    status,
    loading:
      (policy.isLoading && policy.data === undefined) ||
      (policy.isSuccess && settings == null),
    saving: savePolicy.isPending,
    turningOff: turnOffPolicy.isPending,
    busy,
    save,
    turnOff,
    enableProtections,
    clearSpendCaps,
    policyEnabled: status === "ok" && doc != null,
    policyInvalid: status === "invalid",
    spendCapsEnabled: settings != null && hasSpendCaps(settings),
  };
}
