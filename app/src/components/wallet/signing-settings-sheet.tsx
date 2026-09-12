"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { address, type Instruction } from "@solana/kit";
import { toast } from "sonner";
import {
  buildClearTokenVerifierChallenge,
  buildSetTokenVerifierChallenge,
  normalizeVerifierApiBase,
} from "phygital-wallet-sdk";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";

import {
  ConfigChangeHoldCeremony,
  type ConfigChangeCeremonyPhase,
} from "@/components/wallet/config-change-hold-ceremony";
import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { copy } from "@/lib/copy/phygital";
import { shortAddress } from "@/lib/utils";
import {
  applyOptimisticTokenVerifier,
  restoreTokenVerifierSnapshot,
  type TokenVerifierCache,
} from "@/lib/queries";
import { useTokenVerifier } from "@/hooks/wallet/use-token-verifier";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { tryParseAddress } from "@/lib/solana/address";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import { createOneTimeGrant } from "@/lib/wallet/policies-client";
import {
  previewClearTokenVerifierInstruction,
  previewSetTokenVerifierInstruction,
} from "@/lib/wallet/config-preview";
import {
  getClearTokenVerifierInstructions,
  getSetTokenVerifierInstructions,
} from "@/lib/wallet/token-verifier";
import {
  createAppVerifierSigner,
  previewConfigIntent,
  sendConfigTransaction,
  type AppVerifierSigner,
} from "@/lib/wallet/verifier-fee-payer";

type View = "menu" | "warn" | "custom" | "ceremony";

type PendingConfigTx = {
  signer: AppVerifierSigner;
  /** Canonical config intent hash the owner grants (from /preview). */
  intentHash: string;
  /** Details of the change, shown in the approval sheet. */
  approvalRows: { label: string; value: string }[];
  /** Tap the accessory + build the proof-carrying instructions (post-grant). */
  buildInstructions: () => Promise<Instruction[]>;
  nextStatus: TokenVerifierCache;
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
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const pendingRef = useRef<PendingConfigTx | null>(null);

  const verifierStatus = useTokenVerifier(phygitalTokenPda);
  const isCustom = verifierStatus.data?.custom === true;

  function runAfterPreview(pending: PendingConfigTx) {
    pendingRef.current = pending;
    // Config always requires owner approval — open the shared approval sheet
    // (same as Send). The hold ceremony sits behind it, busy until approved.
    setApprovalOpen(true);
  }

  function cancelApproval() {
    if (approving) return;
    const errorView = pendingRef.current?.errorView ?? "menu";
    setApprovalOpen(false);
    pendingRef.current = null;
    setHoldPending(false);
    setView(errorView);
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
      setView(pending.errorView);
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
      const before = applyOptimisticTokenVerifier(
        queryClient,
        phygitalTokenPda,
        pending.nextStatus,
      );
      pending.onSuccess();
      pendingRef.current = null;
      setHoldPending(false);
      setCeremonyPhase("success");
      try {
        await confirmed;
      } catch (e) {
        restoreTokenVerifierSnapshot(queryClient, phygitalTokenPda, before);
        setView(pending.errorView);
        toast.error(toUserErrorMessage(e));
      }
    } catch (e) {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      pendingRef.current = null;
      setHoldPending(false);
      setView(pending.errorView);
      toast.error(toUserErrorMessage(e));
    }
  }

  async function validateEndpoint(endpoint: string): Promise<boolean> {
    const trimmed = endpoint.trim();
    if (!trimmed.startsWith("https://")) return false;
    try {
      const response = await fetch(
        `${normalizeVerifierApiBase(trimmed)}/health`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return false;
      const body = (await response.json()) as { ok?: boolean };
      return body?.ok === true;
    } catch {
      return false;
    }
  }

  async function saveCustom() {
    const verifierAddr = tryParseAddress(verifier.trim());
    if (!verifierAddr || !(await validateEndpoint(endpoint.trim()))) {
      toast.error(copy.wallet.signingInvalidCustom);
      return;
    }
    if (!acked) return;
    const normalizedEndpoint = normalizeVerifierApiBase(endpoint.trim());
    setCeremonyPhase("holding");
    setHoldPending(true); // busy behind the approval sheet until approved
    setApprovalOpen(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const signer = await createAppVerifierSigner(rpc, tokenPda);
      // Preview first (no tap): get the canonical intent hash to grant.
      const previewIx = await previewSetTokenVerifierInstruction({
        verifier: signer,
        overrideVerifier: verifierAddr,
        endpoint: normalizedEndpoint,
        phygitalTokenPda: tokenPda,
      });
      const intentHash = await previewConfigIntent(signer, previewIx);
      runAfterPreview({
        signer,
        intentHash,
        approvalRows: [
          {
            label: copy.wallet.customVerifier,
            value: shortAddress(String(verifierAddr), 6),
          },
          { label: copy.wallet.customEndpoint, value: normalizedEndpoint },
        ],
        buildInstructions: async () => {
          const { slotNumber, messageHash } =
            await buildSetTokenVerifierChallenge(
              rpc,
              tokenPda,
              verifierAddr,
              normalizedEndpoint,
            );
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          const verify = await buildSecp256r1VerifyInstruction(tap);
          return getSetTokenVerifierInstructions({
            verifier: signer,
            overrideVerifier: verifierAddr,
            endpoint: normalizedEndpoint,
            passkeyAuth: {
              secp256r1VerifyInstruction: verify.secp256r1VerifyInstruction,
              phygitalTokenPda: verify.phygitalTokenPda,
              secp256r1VerifyArgs: verify.secp256r1VerifyArgs,
              slotNumber,
            },
          });
        },
        errorView: "custom",
        nextStatus: {
          custom: true,
          verifier: String(verifierAddr),
          endpoint: normalizedEndpoint,
          payer: verifierStatus.data?.payer ?? null,
          usesDefaultPaymaster: false,
        },
        onSuccess: () => {
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
    setHoldPending(true);
    setApprovalOpen(false);
    setView("ceremony");
    try {
      const rpc = getSolanaRpc();
      const tokenPda = address(phygitalTokenPda);
      const signer = await createAppVerifierSigner(rpc, tokenPda);
      const rentReceiver = verifierStatus.data?.payer
        ? address(verifierStatus.data.payer)
        : undefined;
      const previewIx = await previewClearTokenVerifierInstruction({
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
            await buildClearTokenVerifierChallenge(rpc, tokenPda);
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          const verify = await buildSecp256r1VerifyInstruction(tap);
          return getClearTokenVerifierInstructions({
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
        errorView: "menu",
        nextStatus: {
          custom: false,
          verifier: null,
          endpoint: null,
          payer: null,
          usesDefaultPaymaster: true,
        },
        onSuccess: () => {
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
      <>
        <ConfigChangeHoldCeremony
          phase={ceremonyPhase}
          holdPending={holdPending}
          onLeadingClick={onClose}
          leadingLabel={copy.common.cancel}
          onHold={() => void onHoldToSign()}
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
        leading={<NavBarBack onClick={onClose} desktopHidden />}
        title={copy.wallet.signing}
      />
      <p className="text-sm text-muted-foreground">{copy.wallet.signingBody}</p>
      <div className="rounded-2xl bg-muted/25 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {copy.wallet.signingCurrent}
        </p>
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
