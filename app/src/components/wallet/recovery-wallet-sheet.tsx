"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { address } from "@solana/kit";
import { toast } from "sonner";
import {
  buildClearRecoveryWalletChallenge,
  buildSetRecoveryWalletChallenge,
  getClearRecoveryWalletInstructions,
  getSetRecoveryWalletInstructions,
} from "phygital-wallet-sdk";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { CeremonyShell } from "@/components/shared/ceremony-shell";
import { NfcHoldStatus } from "@/components/shared/nfc-hold-status";
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
      const feePayer = await createAppVerifierSigner(rpc, tokenPda);
      const { slotNumber, messageHash } = await buildSetRecoveryWalletChallenge(
        rpc,
        tokenPda,
        recoveryAddr,
      );
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getSetRecoveryWalletInstructions({
        rpc,
        payer: feePayer,
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
        feePayer,
      });
      await confirmed;
      invalidate();
      setPubkeyInput("");
      setView("success");
      toast.success(copy.wallet.recoveryWalletSaved);
    } catch (e) {
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  async function clearRecovery() {
    setView("holding");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const feePayer = await createAppVerifierSigner(rpc, tokenPda);
      const { slotNumber, messageHash } =
        await buildClearRecoveryWalletChallenge(rpc, tokenPda);
      const tap = await authenticatePasskeyForSecp256r1Verify({
        rpc,
        messageHash,
      });
      const verify = await buildSecp256r1VerifyInstruction(tap);
      const instructions = await getClearRecoveryWalletInstructions({
        rpc,
        passkeyAuth: {
          secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
          phygitalTokenPda: verify.phygitalTokenPda,
          secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
          slotNumber,
        },
      });
      const { confirmed } = await sendTransaction({
        instructions,
        feePayer,
      });
      await confirmed;
      invalidate();
      setPubkeyInput("");
      setView("success");
      toast.success(copy.wallet.recoveryWalletCleared);
    } catch (e) {
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  if (view === "holding" || view === "success") {
    return (
      <CeremonyShell
        leading={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              view === "holding" ? setView("form") : onClose()
            }
          >
            {view === "holding" ? copy.common.cancel : copy.common.done}
          </Button>
        }
      >
        <NfcHoldStatus
          size="lg"
          pulsing={view === "holding"}
          busy={view === "holding"}
          tone={view === "success" ? "success" : "default"}
          title={view === "success" ? copy.common.done : copy.wallet.holdToSave}
          body={
            view === "success"
              ? copy.wallet.recoveryWalletRecoverSiteNote
              : copy.verify.holdStillBody
          }
          action={
            view === "success" ? (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={onClose}
              >
                {copy.common.done}
              </Button>
            ) : undefined
          }
        />
      </CeremonyShell>
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
          className="mt-auto"
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
        className="mt-auto"
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
