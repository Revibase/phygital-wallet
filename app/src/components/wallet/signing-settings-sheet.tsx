"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { address, type Instruction } from "@solana/kit";
import { toast } from "sonner";
import {
  buildClearTokenVerifierChallenge,
  buildSetTokenVerifierChallenge,
} from "phygital-wallet-sdk";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";

import {
  ConfigChangeHoldCeremony,
  type ConfigChangeCeremonyPhase,
} from "@/components/wallet/config-change-hold-ceremony";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { copy } from "@/lib/copy/phygital";
import {
  invalidatePhygitalToken,
  invalidateWalletBalances,
  queryKeys,
} from "@/lib/queries";
import { useTokenVerifier } from "@/hooks/wallet/use-token-verifier";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { tryParseAddress } from "@/lib/solana/address";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  getClearTokenVerifierInstructions,
  getSetTokenVerifierInstructions,
} from "@/lib/wallet/token-verifier";
import {
  createAppVerifierSigner,
  sendConfigTransaction,
  type AppVerifierSigner,
} from "@/lib/wallet/verifier-fee-payer";

type View = "menu" | "warn" | "custom" | "ceremony";

type PendingConfigTx = {
  signer: AppVerifierSigner;
  instructions: Instruction[];
  onSuccess: () => void;
  errorView: View;
};

/** Cosigner settings — Revibase by default; custom requires explicit ack. */
export function SigningSettingsSheet({
  phygitalTokenPda,
  onClose,
}: {
  phygitalTokenPda: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("menu");
  const [ceremonyPhase, setCeremonyPhase] =
    useState<ConfigChangeCeremonyPhase>("holding");
  const [endpoint, setEndpoint] = useState("https://");
  const [verifier, setVerifier] = useState("");
  const [acked, setAcked] = useState(false);
  const [needsPhoneConfirm, setNeedsPhoneConfirm] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const pendingRef = useRef<PendingConfigTx | null>(null);

  const verifierStatus = useTokenVerifier(phygitalTokenPda);
  const isCustom = verifierStatus.data?.custom === true;

  function afterSigningTxConfirmed() {
    invalidatePhygitalToken(queryClient, phygitalTokenPda);
    invalidateWalletBalances(queryClient, { tokens: [phygitalTokenPda] });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tokenVerifier.byToken(phygitalTokenPda),
    });
  }

  async function finishConfigTx(pending: PendingConfigTx) {
    const { confirmed } = await sendConfigTransaction({
      instructions: pending.instructions,
      signer: pending.signer,
    });
    await confirmed;
    pending.onSuccess();
    pendingRef.current = null;
    setConfirmPending(false);
    setCeremonyPhase("success");
  }

  async function runAfterNfc(pending: PendingConfigTx) {
    pendingRef.current = pending;
    setNeedsPhoneConfirm(pending.signer.requiresOwnerCosignAssertion);
    if (pending.signer.requiresOwnerCosignAssertion) {
      setCeremonyPhase("confirming");
      return;
    }
    await finishConfigTx(pending);
  }

  async function onConfirmPhone() {
    const pending = pendingRef.current;
    if (!pending) return;
    setConfirmPending(true);
    try {
      await finishConfigTx(pending);
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setConfirmPending(false);
      setView(pending.errorView);
      toast.error(toUserErrorMessage(e));
    }
  }

  async function saveCustom() {
    const verifierAddr = tryParseAddress(verifier.trim());
    if (!verifierAddr || !endpoint.trim().startsWith("https://")) {
      toast.error(copy.wallet.signingInvalidCustom);
      return;
    }
    if (!acked) return;
    setCeremonyPhase("holding");
    setConfirmPending(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const [signer, { slotNumber, messageHash }] = await Promise.all([
        createAppVerifierSigner(rpc, tokenPda),
        buildSetTokenVerifierChallenge(
          rpc,
          tokenPda,
          verifierAddr,
          endpoint.trim(),
        ),
      ]);
      setNeedsPhoneConfirm(signer.requiresOwnerCosignAssertion);
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getSetTokenVerifierInstructions({
        verifier: signer,
        overrideVerifier: verifierAddr,
        endpoint: endpoint.trim(),
        passkeyAuth: {
          secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
          phygitalTokenPda: verify.phygitalTokenPda,
          secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
          slotNumber,
        },
      });
      await runAfterNfc({
        signer,
        instructions,
        errorView: "custom",
        onSuccess: () => {
          afterSigningTxConfirmed();
          toast.success(copy.wallet.signingCustomSaved);
        },
      });
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setView("custom");
      toast.error(toUserErrorMessage(e));
    }
  }

  async function restoreDefault() {
    setCeremonyPhase("holding");
    setConfirmPending(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const [signer, { slotNumber, messageHash }] = await Promise.all([
        createAppVerifierSigner(rpc, tokenPda),
        buildClearTokenVerifierChallenge(rpc, tokenPda),
      ]);
      setNeedsPhoneConfirm(signer.requiresOwnerCosignAssertion);
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getClearTokenVerifierInstructions({
        rpc,
        verifier: signer,
        rentReceiver: verifierStatus.data?.payer
          ? address(verifierStatus.data.payer)
          : undefined,
        passkeyAuth: {
          secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
          phygitalTokenPda: verify.phygitalTokenPda,
          secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
          slotNumber,
        },
      });
      await runAfterNfc({
        signer,
        instructions,
        errorView: "menu",
        onSuccess: () => {
          afterSigningTxConfirmed();
          toast.success(copy.wallet.signingRestored);
        },
      });
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setView("menu");
      toast.error(toUserErrorMessage(e));
    }
  }

  if (view === "ceremony") {
    return (
      <ConfigChangeHoldCeremony
        phase={ceremonyPhase}
        needsPhoneConfirm={needsPhoneConfirm}
        confirmPending={confirmPending}
        onLeadingClick={onClose}
        leadingLabel={copy.common.cancel}
        onConfirmPhone={() => void onConfirmPhone()}
        successAction={
          <Button type="button" size="lg" className="w-full" onClick={onClose}>
            {copy.common.done}
          </Button>
        }
      />
    );
  }

  if (view === "warn") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={<NavBarBack onClick={() => setView("menu")} />}
          title={copy.wallet.signing}
        />
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {copy.wallet.signingCustomPolicyWarn}
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/25 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
          />
          <span className="text-sm leading-relaxed">
            {copy.wallet.signingCustomAck}
          </span>
        </label>
        <Button
          type="button"
          size="lg"
          disabled={!acked}
          onClick={() => setView("custom")}
        >
          {copy.wallet.signingCustomContinue}
        </Button>
      </div>
    );
  }

  if (view === "custom") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={<NavBarBack onClick={() => setView("warn")} />}
          title={copy.wallet.signing}
        />
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {copy.wallet.signingCustomPolicyWarn}
        </p>
        <FieldLabel className="normal-case tracking-normal text-xs">
          {copy.wallet.customVerifier}
        </FieldLabel>
        <Input
          value={verifier}
          onChange={(e) => setVerifier(e.target.value)}
          placeholder={copy.wallet.verifierPubkey}
          className="font-mono text-sm"
        />
        <FieldLabel className="normal-case tracking-normal text-xs">
          {copy.wallet.customEndpoint}
        </FieldLabel>
        <Input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://"
          className="font-mono text-sm"
        />
        <Button
          type="button"
          size="lg"
          disabled={!acked}
          onClick={() => void saveCustom()}
        >
          {copy.wallet.holdToSave}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onClose} />}
        title={copy.wallet.signing}
      />
      <p className="text-sm text-muted-foreground">{copy.wallet.signingBody}</p>
      <div className="rounded-2xl bg-muted/25 px-4 py-3">
        <p className="text-xs text-muted-foreground">{copy.wallet.signingCurrent}</p>
        <p className="text-sm font-medium">
          {isCustom ? copy.wallet.signingCustom : copy.wallet.signingDefault}
        </p>
        {isCustom && verifierStatus.data?.endpoint ? (
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {verifierStatus.data.endpoint}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setAcked(false);
          setView("warn");
        }}
        className="h-auto min-h-11 w-full justify-between rounded-2xl bg-muted/25 px-4 py-4 text-left font-normal"
      >
        <span className="text-sm">{copy.wallet.useCustomSigning}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Button>
      {isCustom ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void restoreDefault()}
        >
          {copy.wallet.restoreDefault}
        </Button>
      ) : null}
    </div>
  );
}
