"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { address } from "@solana/kit";
import { toast } from "sonner";
import {
  buildClearRecoveryWalletChallenge,
  buildSetRecoveryWalletChallenge,
} from "phygital-wallet-sdk";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { ConfigChangeHoldCeremony } from "@/components/wallet/config-change-hold-ceremony";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRecoveryWallet } from "@/hooks/wallet/use-recovery-wallet";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { tryParseAddress } from "@/lib/solana/address";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { sendTransaction } from "@/lib/solana/tx";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  getClearRecoveryWalletInstructions,
  getSetRecoveryWalletInstructions,
} from "@/lib/wallet/recovery-wallet";
import { createAppVerifierSigner } from "@/lib/wallet/verifier-fee-payer";

type View = "form" | "confirmClear" | "holding" | "success";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Owner settings — set/clear an ed25519 recovery pubkey (paste any valid address). */
export function RecoveryWalletSheet({
  phygitalTokenPda,
  onClose,
}: {
  phygitalTokenPda: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const status = useRecoveryWallet(phygitalTokenPda);
  const [view, setView] = useState<View>("form");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [acked, setAcked] = useState(false);
  const [needsPhoneConfirm, setNeedsPhoneConfirm] = useState(false);

  const configured = status.data?.configured ?? false;
  const current = status.data?.recoveryWallet ?? null;

  const parsedInput = useMemo(
    () => tryParseAddress(pubkeyInput.trim()),
    [pubkeyInput],
  );
  const inputValid =
    Boolean(parsedInput) && String(parsedInput) !== SYSTEM_PROGRAM;
  const isSameAsCurrent =
    inputValid && current != null && String(parsedInput) === current;
  const canSave = inputValid && !isSameAsCurrent && acked;

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.recoveryWallet.byToken(phygitalTokenPda),
    });
  }

  async function saveRecovery() {
    const recoveryAddr = tryParseAddress(pubkeyInput.trim());
    if (!recoveryAddr || String(recoveryAddr) === SYSTEM_PROGRAM) {
      toast.error(copy.wallet.recoveryWalletInvalid);
      return;
    }
    if (current != null && String(recoveryAddr) === current) {
      toast.error(copy.wallet.recoveryWalletSame);
      return;
    }
    setView("holding");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const [signer, { slotNumber, messageHash }] = await Promise.all([
        createAppVerifierSigner(rpc, tokenPda),
        buildSetRecoveryWalletChallenge(rpc, tokenPda, recoveryAddr),
      ]);
      setNeedsPhoneConfirm(signer.requiresOwnerCosignAssertion);
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getSetRecoveryWalletInstructions({
        verifier: signer,
        recoveryWallet: recoveryAddr,
        passkeyAuth: {
          secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
          phygitalTokenPda: verify.phygitalTokenPda,
          secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
          slotNumber,
        },
      });
      const { confirmed } = await sendTransaction({
        instructions,
        feePayer: signer,
      });
      await confirmed;
      invalidate();
      setPubkeyInput("");
      setView("success");
      toast.success(copy.wallet.recoveryWalletSaved);
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  async function clearRecovery() {
    setView("holding");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const [signer, { slotNumber, messageHash }] = await Promise.all([
        createAppVerifierSigner(rpc, tokenPda),
        buildClearRecoveryWalletChallenge(rpc, tokenPda),
      ]);
      setNeedsPhoneConfirm(signer.requiresOwnerCosignAssertion);
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getClearRecoveryWalletInstructions({
        rpc,
        verifier: signer,
        rentReceiver: status.data?.payer
          ? address(status.data.payer)
          : undefined,
        passkeyAuth: {
          secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
          phygitalTokenPda: verify.phygitalTokenPda,
          secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
          slotNumber,
        },
      });
      const { confirmed } = await sendTransaction({
        instructions,
        feePayer: signer,
      });
      await confirmed;
      invalidate();
      setPubkeyInput("");
      setView("success");
      toast.success(copy.wallet.recoveryWalletCleared);
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  if (view === "holding" || view === "success") {
    return (
      <ConfigChangeHoldCeremony
        phase={view}
        needsPhoneConfirm={needsPhoneConfirm}
        onLeadingClick={() =>
          view === "holding" ? setView("form") : onClose()
        }
        leadingLabel={
          view === "holding" ? copy.common.cancel : copy.common.done
        }
        successBody={copy.wallet.recoveryWalletRecoverSiteNote}
        successAction={
          <Button type="button" size="lg" className="w-full" onClick={onClose}>
            {copy.common.done}
          </Button>
        }
      />
    );
  }

  if (view === "confirmClear") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={
            <NavBarBack onClick={() => setView("form")} />
          }
          title={copy.wallet.recoveryWalletClearConfirmTitle}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {copy.wallet.recoveryWalletClearConfirmBody}
        </p>
        {current ? (
          <div className="rounded-2xl bg-muted/25 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {copy.wallet.recoveryWalletCurrent}
            </p>
            <CopyableAddress
              address={current}
              length={6}
              label={copy.wallet.recoveryWalletPubkey}
              className="mt-1 text-sm font-medium"
            />
          </div>
        ) : null}
        <Button
          type="button"
          size="lg"
          variant="destructive"
          onClick={() => void clearRecovery()}
        >
          {copy.wallet.recoveryWalletClearConfirmCta}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onClose} />}
        title={copy.wallet.recoveryWallet}
      />
      <p className="text-sm text-muted-foreground">
        {copy.wallet.recoveryWalletBody}
      </p>
      <p className="text-xs text-muted-foreground">
        {copy.wallet.recoveryWalletHint}
      </p>

      {status.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-2xl bg-muted/25 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {copy.wallet.recoveryWalletCurrent}
          </p>
          {configured && current ? (
            <CopyableAddress
              address={current}
              length={6}
              label={copy.wallet.recoveryWalletPubkey}
              className="mt-1 text-sm font-medium"
            />
          ) : (
            <p className="mt-0.5 text-sm font-medium">
              {copy.wallet.recoveryWalletNotConfigured}
            </p>
          )}
        </div>
      )}

      <FieldLabel className="normal-case tracking-normal text-xs">
        {copy.wallet.recoveryWalletPubkey}
      </FieldLabel>
      <Input
        value={pubkeyInput}
        onChange={(e) => setPubkeyInput(e.target.value)}
        placeholder={copy.wallet.recoveryWalletPubkeyPlaceholder}
        className="font-mono text-sm"
        autoComplete="off"
        spellCheck={false}
      />
      {pubkeyInput.trim() && !inputValid ? (
        <p className="text-xs text-destructive">
          {copy.wallet.recoveryWalletInvalid}
        </p>
      ) : null}
      {isSameAsCurrent ? (
        <p className="text-xs text-muted-foreground">
          {copy.wallet.recoveryWalletSame}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {copy.wallet.recoveryWalletRecoverSiteNote}
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/25 px-4 py-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
        />
        <span className="text-sm leading-relaxed">
          {copy.wallet.recoveryWalletAck}
        </span>
      </label>

      <Button
        type="button"
        size="lg"
        disabled={!canSave}
        onClick={() => void saveRecovery()}
      >
        {configured
          ? copy.wallet.recoveryWalletReplace
          : copy.wallet.recoveryWalletSave}
      </Button>

      {configured ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setView("confirmClear")}
        >
          {copy.wallet.recoveryWalletClear}
        </Button>
      ) : null}
    </div>
  );
}
