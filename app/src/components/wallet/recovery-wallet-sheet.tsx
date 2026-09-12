"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { address, type Instruction } from "@solana/kit";
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
import {
  ConfigChangeHoldCeremony,
  type ConfigChangeCeremonyPhase,
} from "@/components/wallet/config-change-hold-ceremony";
import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { shortAddress } from "@/lib/utils";
import { useRecoveryWallet } from "@/hooks/wallet/use-recovery-wallet";
import { copy } from "@/lib/copy/phygital";
import {
  applyOptimisticRecoveryWallet,
  restoreRecoveryWalletSnapshot,
  type RecoveryWalletCache,
} from "@/lib/queries";
import { tryParseAddress } from "@/lib/solana/address";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import { createOneTimeGrant } from "@/lib/wallet/policies-client";
import {
  previewClearRecoveryWalletInstruction,
  previewSetRecoveryWalletInstruction,
} from "@/lib/wallet/config-preview";
import {
  getClearRecoveryWalletInstructions,
  getSetRecoveryWalletInstructions,
} from "@/lib/wallet/recovery-wallet";
import {
  createAppVerifierSigner,
  previewConfigIntent,
  sendConfigTransaction,
  type AppVerifierSigner,
} from "@/lib/wallet/verifier-fee-payer";

type View = "form" | "confirmClear" | "ceremony";

type PendingConfigTx = {
  signer: AppVerifierSigner;
  /** Canonical config intent hash the owner grants (from /preview). */
  intentHash: string;
  /** Details of the change, shown in the approval sheet. */
  approvalRows: { label: string; value: string }[];
  /** Tap the accessory + build the proof-carrying instructions (post-grant). */
  buildInstructions: () => Promise<Instruction[]>;
  nextStatus: RecoveryWalletCache;
  onSuccess: () => void;
};

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
  const [ceremonyPhase, setCeremonyPhase] =
    useState<ConfigChangeCeremonyPhase>("holding");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [acked, setAcked] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const pendingRef = useRef<PendingConfigTx | null>(null);

  const configured = status.data?.configured ?? false;
  const current = status.data?.recoveryWallet ?? null;

  const parsedInput = useMemo(
    () => tryParseAddress(pubkeyInput.trim()),
    [pubkeyInput]
  );
  const inputValid =
    Boolean(parsedInput) && String(parsedInput) !== SYSTEM_PROGRAM;
  const isSameAsCurrent =
    inputValid && current != null && String(parsedInput) === current;
  const canSave = inputValid && !isSameAsCurrent && acked;

  function runAfterPreview(pending: PendingConfigTx) {
    pendingRef.current = pending;
    // Config always requires owner approval — open the shared approval sheet
    // (same as Send). The hold ceremony sits behind it, busy until approved.
    setApprovalOpen(true);
  }

  function cancelApproval() {
    if (approving) return;
    setApprovalOpen(false);
    pendingRef.current = null;
    setHoldPending(false);
    setView("form");
  }

  // Step 1: owner approves the change with their device passkey (creates the
  // one-time grant). This consumes the WebAuthn user activation, so the
  // accessory tap cannot follow in the same gesture — reveal the hold step.
  async function onApproveGrant() {
    const pending = pendingRef.current;
    if (!pending) return;
    setApproving(true);
    try {
      await createOneTimeGrant(phygitalTokenPda, pending.intentHash);
      setApproving(false);
      setApprovalOpen(false);
      setHoldPending(false); // reveal the "Hold to save" CTA
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      setApproving(false);
      setApprovalOpen(false);
      pendingRef.current = null;
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  // Step 2: fresh gesture — tap the accessory to produce the Secp256r1 proof,
  // then sign the granted change.
  async function onHoldToSign() {
    const pending = pendingRef.current;
    if (!pending) return;
    setHoldPending(true);
    try {
      const instructions = await pending.buildInstructions();
      const { confirmed } = await sendConfigTransaction({
        instructions,
        signer: pending.signer,
      });
      const before = applyOptimisticRecoveryWallet(
        queryClient,
        phygitalTokenPda,
        pending.nextStatus
      );
      pending.onSuccess();
      pendingRef.current = null;
      setHoldPending(false);
      setCeremonyPhase("success");
      try {
        await confirmed;
      } catch (e) {
        restoreRecoveryWalletSnapshot(queryClient, phygitalTokenPda, before);
        setView("form");
        toast.error(toUserErrorMessage(e));
      }
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setHoldPending(false);
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
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
    setCeremonyPhase("holding");
    setHoldPending(true);
    setApprovalOpen(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const signer = await createAppVerifierSigner(rpc, tokenPda);
      const previewIx = await previewSetRecoveryWalletInstruction({
        verifier: signer,
        recoveryWallet: recoveryAddr,
        phygitalTokenPda: tokenPda,
      });
      const intentHash = await previewConfigIntent(signer, previewIx);
      runAfterPreview({
        signer,
        intentHash,
        approvalRows: [
          {
            label: copy.wallet.recoveryWallet,
            value: shortAddress(String(recoveryAddr), 6),
          },
        ],
        buildInstructions: async () => {
          const { slotNumber, messageHash } =
            await buildSetRecoveryWalletChallenge(rpc, tokenPda, recoveryAddr);
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          const verify = await buildSecp256r1VerifyInstruction(tap);
          return getSetRecoveryWalletInstructions({
            verifier: signer,
            recoveryWallet: recoveryAddr,
            passkeyAuth: {
              secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
              phygitalTokenPda: verify.phygitalTokenPda,
              secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
              slotNumber,
            },
          });
        },
        nextStatus: {
          configured: true,
          recoveryWallet: String(recoveryAddr),
          payer: status.data?.payer ?? null,
        },
        onSuccess: () => {
          setPubkeyInput("");
          toast.success(copy.wallet.recoveryWalletSaved);
        },
      });
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  async function clearRecovery() {
    setCeremonyPhase("holding");
    setHoldPending(true);
    setApprovalOpen(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const signer = await createAppVerifierSigner(rpc, tokenPda);
      const rentReceiver = status.data?.payer
        ? address(status.data.payer)
        : undefined;
      const previewIx = await previewClearRecoveryWalletInstruction({
        rpc,
        verifier: signer,
        phygitalTokenPda: tokenPda,
        rentReceiver,
      });
      const intentHash = await previewConfigIntent(signer, previewIx);
      runAfterPreview({
        signer,
        intentHash,
        approvalRows: [],
        buildInstructions: async () => {
          const { slotNumber, messageHash } =
            await buildClearRecoveryWalletChallenge(rpc, tokenPda);
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          const verify = await buildSecp256r1VerifyInstruction(tap);
          return getClearRecoveryWalletInstructions({
            rpc,
            verifier: signer,
            rentReceiver,
            passkeyAuth: {
              secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
              phygitalTokenPda: verify.phygitalTokenPda,
              secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
              slotNumber,
            },
          });
        },
        nextStatus: {
          configured: false,
          recoveryWallet: null,
          payer: null,
        },
        onSuccess: () => {
          setPubkeyInput("");
          toast.success(copy.wallet.recoveryWalletCleared);
        },
      });
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setView("form");
      toast.error(toUserErrorMessage(e));
    }
  }

  if (view === "ceremony") {
    return (
      <>
        <ConfigChangeHoldCeremony
          phase={ceremonyPhase}
          holdPending={holdPending}
          onLeadingClick={() =>
            ceremonyPhase === "success" ? onClose() : setView("form")
          }
          leadingLabel={
            ceremonyPhase === "success" ? copy.common.done : copy.common.cancel
          }
          onHold={() => void onHoldToSign()}
          successBody={copy.wallet.recoveryWalletRecoverSiteNote}
          successAction={
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={onClose}
            >
              {copy.common.done}
            </Button>
          }
        />
        <Sheet
          open={approvalOpen}
          onOpenChange={(open) => {
            if (!open) cancelApproval();
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              if (approving) e.preventDefault();
            }}
            className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0 md:rounded-3xl"
          >
            <ApprovalSheetBody
              title={copy.wallet.configChangeConfirmTitle}
              body={copy.wallet.configChangeConfirmBody}
              detailRows={pendingRef.current?.approvalRows ?? []}
              busy={approving}
              mode="owner"
              onApprove={() => void onApproveGrant()}
              onClose={cancelApproval}
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  if (view === "confirmClear") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={<NavBarBack onClick={() => setView("form")} />}
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
        leading={<NavBarBack onClick={onClose} desktopHidden />}
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
