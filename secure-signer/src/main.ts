/**
 * Signer entry point + message dispatcher.
 *
 * Trust boundary (§8, §9, §44): every value crossing from the parent is
 * attacker-controlled. This module verifies origin AND source, validates the
 * schema, enforces replay/freshness and operation isolation, then routes via an
 * explicit switch (NEVER dynamic dispatch) to handlers that independently derive
 * everything security-sensitive. Unknown or malformed input fails closed.
 */

import "./styles.css";
import { getAddressDecoder, getBase58Decoder } from "@solana/kit";
import { readLocalBlob, writeLocalBlob } from "./blob-store.js";
import {
  backupOwnerWalletBlob,
  issueBackupChallenge,
  issueRestoreChallenge,
  restoreOwnerWalletBlob,
} from "./api-backup.js";
import {
  EXPECTED_PARENT_ORIGIN,
  MAX_CREDENTIAL_ID_BYTES,
  MAX_TX_BYTES,
  PUT_CHALLENGE_PREFIX,
} from "./constants.js";
import {
  base64ToBytes,
  bytesEqual,
  bytesToBase64,
  utf8ToBytes,
} from "./encoding.js";
import { ed25519Sign } from "./crypto.js";
import {
  errorResponse,
  RESULT_TYPE,
  validateInbound,
  type ErrorCode,
  type InboundRequest,
} from "./protocol.js";
import { digestHex, SignerState } from "./state.js";
import { decodeV1Transaction } from "./tx/decode-v1.js";
import { evaluatePolicy, previewPolicy } from "./tx/policy.js";
import {
  BrowserPrfProvider,
  currentRpId,
  WebAuthnUnsupported,
} from "./webauthn.js";
import {
  decryptWallet,
  enrollExistingCredential,
  parseBlob,
  ServiceError,
  signAndScrub,
  unwrapWallet,
} from "./wallet-service.js";
import type { ParsedWalletBlob } from "./wallet-format.js";
import * as ui from "./ui/ui.js";

const addr = getAddressDecoder();
const b58 = getBase58Decoder();
const prf = new BrowserPrfProvider();
const state = new SignerState();

const toBase58Pubkey = (bytes: Uint8Array): string => addr.decode(bytes);

function prefixedChallengeMessage(
  prefix: string,
  challengeBytes: Uint8Array,
): Uint8Array {
  const p = utf8ToBytes(prefix);
  const out = new Uint8Array(p.length + challengeBytes.length);
  out.set(p, 0);
  out.set(challengeBytes, p.length);
  return out;
}

function signChallenge(
  challengeB64: string | undefined,
  seed: Uint8Array,
  prefix: string,
): string | undefined {
  if (!challengeB64) return undefined;
  try {
    const challengeBytes = base64ToBytes(challengeB64, 64, "url");
    const sig = ed25519Sign(
      prefixedChallengeMessage(prefix, challengeBytes),
      seed,
    );
    return bytesToBase64(sig, "url");
  } catch {
    return undefined;
  }
}

function beginBusy(requestId: string, message: string) {
  let dismissed = false;
  ui.setBusyDismiss(() => {
    if (dismissed) return;
    dismissed = true;
    fail(requestId, "USER_CANCELLED");
  });
  ui.renderBusy(message);
  return {
    wasDismissed: () => dismissed,
    clear: () => ui.setBusyDismiss(null),
  };
}

function post(message: Record<string, unknown>): void {
  (window.parent as Window).postMessage(message, EXPECTED_PARENT_ORIGIN);
}

function fail(requestId: string | undefined, code: ErrorCode): void {
  post(errorResponse(requestId, code));
}

function ok(
  requestId: string,
  type: string,
  extra: Record<string, unknown>,
): void {
  post({ type, requestId, ...extra });
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.origin !== EXPECTED_PARENT_ORIGIN) return;
  if (event.source !== window.parent) return;

  const validation = validateInbound(event.data);
  if (!validation.ok) {
    fail(validation.requestId, validation.code);
    return;
  }
  const request = validation.request;

  const replay = state.checkFreshnessAndReplay(
    request.requestId,
    request.timestamp,
  );
  if (replay) {
    fail(request.requestId, replay);
    return;
  }
  state.remember(request.requestId);

  void handle(request).catch(() => {
    fail(request.requestId, "INTERNAL_ERROR");
    state.end();
    ui.renderIdle();
  });
});

async function handle(request: InboundRequest): Promise<void> {
  const rpId = currentRpId();
  const opFor = {
    AUTH_START: "AUTH_PENDING",
    SIGN_TRANSACTION: "SIGN_PENDING",
    EXPORT_PRIVATE_KEY: "PRIVATE_EXPORT_PENDING",
  } as const;

  const op = opFor[request.type];
  if (!state.begin(op, request.requestId)) {
    fail(request.requestId, "INTERNAL_ERROR");
    return;
  }
  try {
    switch (request.type) {
      case "AUTH_START":
        await handleAuth({
          requestId: request.requestId,
          rpId,
          authMode: request.authMode,
          credentialIdB64: request.credentialId,
          webauthnAttestationObject: request.webauthnAttestationObject,
        });
        break;
      case "SIGN_TRANSACTION":
        await handleSign(request.requestId, rpId, request.transaction);
        break;
      case "EXPORT_PRIVATE_KEY":
        await handleExportPrivateKey(request.requestId, rpId);
        break;
    }
  } catch (e) {
    fail(request.requestId, codeOf(e));
  } finally {
    state.end();
    ui.renderIdle();
  }
}

async function pushBackup(opts: {
  encryptedWalletBlob: string;
  publicKey: string;
  putChallengeId: string;
  putSignature: string;
  webauthnAttestationObject?: string;
  webauthnAssertion?: Record<string, unknown>;
  webauthnConfirmAssertion?: Record<string, unknown>;
  confirmChallengeId?: string;
}): Promise<{ expiresAt: number; webauthnBound: boolean }> {
  return backupOwnerWalletBlob({
    encryptedWalletBlob: opts.encryptedWalletBlob,
    publicKey: opts.publicKey,
    challengeId: opts.putChallengeId,
    signature: opts.putSignature,
    ...(opts.webauthnAttestationObject
      ? { webauthnAttestationObject: opts.webauthnAttestationObject }
      : {}),
    ...(opts.webauthnAssertion
      ? { webauthnAssertion: opts.webauthnAssertion }
      : {}),
    ...(opts.webauthnConfirmAssertion
      ? { webauthnConfirmAssertion: opts.webauthnConfirmAssertion }
      : {}),
    ...(opts.confirmChallengeId
      ? { confirmChallengeId: opts.confirmChallengeId }
      : {}),
  });
}

async function mintBackupChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  try {
    return await issueBackupChallenge();
  } catch {
    throw new ServiceError("BLOB_UNAVAILABLE");
  }
}

async function mintConfirmCeremony(opts: {
  rpId: string;
  credentialId: Uint8Array;
}): Promise<{
  confirmChallengeId: string;
  confirmAssertion: Record<string, unknown>;
}> {
  const confirm = await issueRestoreChallenge();
  const challengeBytes = base64ToBytes(confirm.challenge, 64, "url");
  const got = await prf.get(opts.rpId, opts.credentialId, challengeBytes);
  if (!got.assertion || typeof got.assertion !== "object") {
    throw new ServiceError("AUTHENTICATION_FAILED");
  }
  return {
    confirmChallengeId: confirm.challengeId,
    confirmAssertion: got.assertion as Record<string, unknown>,
  };
}

/** Create: parent registered passkey → enroll here → backup with attestation. */
async function handleCreate(opts: {
  requestId: string;
  credentialIdB64: string;
  webauthnAttestationObject: string;
}): Promise<void> {
  if (!(await ui.confirmFinishCreate())) {
    return fail(opts.requestId, "USER_CANCELLED");
  }
  const busy = beginBusy(
    opts.requestId,
    "Confirm with your passkey to finish setup…",
  );
  try {
    const { challengeId, challenge } = await mintBackupChallenge();
    let messageToSign: Uint8Array;
    try {
      messageToSign = prefixedChallengeMessage(
        PUT_CHALLENGE_PREFIX,
        base64ToBytes(challenge, 64, "url"),
      );
    } catch {
      return fail(opts.requestId, "INVALID_MESSAGE");
    }
    const credentialId = base64ToBytes(
      opts.credentialIdB64,
      MAX_CREDENTIAL_ID_BYTES,
      "url",
    );
    const created = await enrollExistingCredential(
      prf,
      currentRpId(),
      credentialId,
      { messageToSign },
    );
    if (busy.wasDismissed()) return;
    if (!created.signature) return fail(opts.requestId, "INTERNAL_ERROR");

    const pk = toBase58Pubkey(created.publicKey);
    const blobB64 = bytesToBase64(created.blob, "url");
    let expiresAt: number;
    try {
      ({ expiresAt } = await pushBackup({
        encryptedWalletBlob: blobB64,
        publicKey: pk,
        putChallengeId: challengeId,
        putSignature: bytesToBase64(created.signature, "url"),
        webauthnAttestationObject: opts.webauthnAttestationObject,
      }));
    } catch {
      return fail(opts.requestId, "BLOB_UNAVAILABLE");
    }
    if (!writeLocalBlob(created.blob)) {
      return fail(opts.requestId, "INTERNAL_ERROR");
    }
    await ui.showSuccess(pk, true);
    if (busy.wasDismissed()) return;
    ok(opts.requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      created: true,
      expiresAt,
    });
  } catch (e) {
    if (busy.wasDismissed()) return;
    const code = codeOf(e);
    if (code === "AUTHENTICATION_FAILED" || code === "UNSUPPORTED_CREDENTIAL") {
      const again = await ui.showRecoverable(
        "Passkey confirmation didn’t work. Try again, or cancel and create a new passkey.",
      );
      if (again === "retry") {
        busy.clear();
        return handleCreate(opts);
      }
      return fail(opts.requestId, "USER_CANCELLED");
    }
    throw e;
  } finally {
    busy.clear();
  }
}

/** Unlock with signer-local ciphertext (returning device). */
async function handleLocalUnlock(opts: {
  requestId: string;
  rpId: string;
  raw: Uint8Array;
  parsed: ParsedWalletBlob;
}): Promise<void> {
  if (!(await ui.confirmImport()))
    return fail(opts.requestId, "USER_CANCELLED");
  const busy = beginBusy(opts.requestId, "Use Face ID or Touch ID to approve");
  try {
    const { challengeId, challenge } = await mintBackupChallenge();
    const { seed, publicKey, assertion } = await decryptWallet(
      prf,
      opts.rpId,
      opts.parsed,
    );
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    const putSignature = signChallenge(challenge, seed, PUT_CHALLENGE_PREFIX);
    if (!putSignature) {
      seed.fill(0);
      return fail(opts.requestId, "INTERNAL_ERROR");
    }

    const pk = toBase58Pubkey(publicKey);
    let expiresAt: number;
    let webauthnBound: boolean;
    try {
      ({ expiresAt, webauthnBound } = await pushBackup({
        encryptedWalletBlob: bytesToBase64(opts.raw, "url"),
        publicKey: pk,
        putChallengeId: challengeId,
        putSignature,
      }));
    } catch {
      seed.fill(0);
      return fail(opts.requestId, "BLOB_UNAVAILABLE");
    }

    if (!webauthnBound && assertion && typeof assertion === "object") {
      busy.clear();
      const healBusy = beginBusy(
        opts.requestId,
        "Confirm once more to finish wallet backup…",
      );
      try {
        const confirm = await mintConfirmCeremony({
          rpId: opts.rpId,
          credentialId: opts.parsed.credentialId,
        });
        if (healBusy.wasDismissed()) {
          seed.fill(0);
          return;
        }
        const backup2 = await mintBackupChallenge();
        const putSignature2 = signChallenge(
          backup2.challenge,
          seed,
          PUT_CHALLENGE_PREFIX,
        );
        if (!putSignature2) {
          seed.fill(0);
          return fail(opts.requestId, "INTERNAL_ERROR");
        }
        ({ expiresAt } = await pushBackup({
          encryptedWalletBlob: bytesToBase64(opts.raw, "url"),
          publicKey: pk,
          putChallengeId: backup2.challengeId,
          putSignature: putSignature2,
          webauthnAssertion: assertion as Record<string, unknown>,
          webauthnConfirmAssertion: confirm.confirmAssertion,
          confirmChallengeId: confirm.confirmChallengeId,
        }));
      } catch {
        seed.fill(0);
        return fail(opts.requestId, "BLOB_UNAVAILABLE");
      } finally {
        healBusy.clear();
      }
    }

    seed.fill(0);
    if (!writeLocalBlob(opts.raw)) {
      return fail(opts.requestId, "INTERNAL_ERROR");
    }
    await ui.showSuccess(pk, false);
    if (busy.wasDismissed()) return;
    ok(opts.requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      created: false,
      expiresAt,
    });
  } catch (e) {
    if (busy.wasDismissed()) return;
    const code = codeOf(e);
    if (code === "AUTHENTICATION_FAILED" || code === "DECRYPTION_FAILED") {
      const again = await ui.showRecoverable(
        "Passkey authentication didn’t work. Try again, or cancel if this passkey was removed from this phone.",
      );
      if (again === "retry") {
        return handleLocalUnlock(opts);
      }
      return fail(opts.requestId, "AUTHENTICATION_FAILED");
    }
    throw e;
  } finally {
    busy.clear();
  }
}

/** Unlock via discoverable WebAuthn + remote restore (new device). */
async function handleRemoteUnlock(opts: {
  requestId: string;
  rpId: string;
}): Promise<void> {
  if (!(await ui.confirmImport()))
    return fail(opts.requestId, "USER_CANCELLED");

  let restore: { challengeId: string; challenge: string };
  let backup: { challengeId: string; challenge: string };
  try {
    [restore, backup] = await Promise.all([
      issueRestoreChallenge(),
      issueBackupChallenge(),
    ]);
  } catch {
    return fail(opts.requestId, "BLOB_UNAVAILABLE");
  }

  let fetchChallengeBytes: Uint8Array;
  try {
    fetchChallengeBytes = base64ToBytes(restore.challenge, 64, "url");
  } catch {
    return fail(opts.requestId, "INVALID_MESSAGE");
  }

  let busy = beginBusy(opts.requestId, "Use Face ID or Touch ID to approve");
  let disc;
  try {
    disc = await prf.getDiscoverable(opts.rpId, fetchChallengeBytes);
    if (busy.wasDismissed()) return;
  } catch {
    busy.clear();
    if (busy.wasDismissed()) return;
    const again = await ui.showRecoverable(
      "No wallet was found on this device. Create a passkey, or try again if you cancelled the prompt.",
    );
    if (again === "retry") return handleRemoteUnlock(opts);
    return fail(opts.requestId, "BLOB_UNAVAILABLE");
  }
  busy.clear();
  busy = beginBusy(opts.requestId, "Restoring your wallet…");

  let restored;
  try {
    restored = await restoreOwnerWalletBlob({
      challengeId: restore.challengeId,
      assertion: disc.assertion as unknown as Record<string, unknown>,
    });
  } catch {
    disc.prfOutput.fill(0);
    busy.clear();
    return fail(opts.requestId, "BLOB_UNAVAILABLE");
  }
  if (!restored) {
    disc.prfOutput.fill(0);
    busy.clear();
    const again = await ui.showRecoverable(
      "No backup for this passkey. Create a new passkey on this device.",
    );
    if (again === "retry") return handleRemoteUnlock(opts);
    return fail(opts.requestId, "BLOB_UNAVAILABLE");
  }

  try {
    const raw = base64ToBytes(restored.encryptedWalletBlob, 1024, "url");
    const parsed = parseBlob(raw);
    if (!bytesEqual(parsed.credentialId, disc.credentialId)) {
      disc.prfOutput.fill(0);
      return fail(opts.requestId, "WALLET_MISMATCH");
    }
    const { seed, publicKey } = await unwrapWallet(
      disc.prfOutput,
      parsed,
      opts.rpId,
    );
    disc.prfOutput.fill(0);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    // Refill signer LS as soon as D1 ciphertext is validated — before backup
    // refresh, so a later PUT failure cannot leave this phone empty again.
    if (!writeLocalBlob(raw)) {
      seed.fill(0);
      return fail(opts.requestId, "INTERNAL_ERROR");
    }
    const putSignature = signChallenge(
      backup.challenge,
      seed,
      PUT_CHALLENGE_PREFIX,
    );
    if (!putSignature) {
      seed.fill(0);
      return fail(opts.requestId, "INTERNAL_ERROR");
    }

    const pk = toBase58Pubkey(publicKey);
    let heal:
      | {
          webauthnAssertion: Record<string, unknown>;
          webauthnConfirmAssertion: Record<string, unknown>;
          confirmChallengeId: string;
        }
      | undefined;
    if (restored.needsWebauthnHeal) {
      busy.clear();
      const healBusy = beginBusy(
        opts.requestId,
        "Confirm once more to finish wallet backup…",
      );
      try {
        const confirm = await mintConfirmCeremony({
          rpId: opts.rpId,
          credentialId: parsed.credentialId,
        });
        if (healBusy.wasDismissed()) {
          seed.fill(0);
          return;
        }
        heal = {
          webauthnAssertion: disc.assertion as unknown as Record<
            string,
            unknown
          >,
          webauthnConfirmAssertion: confirm.confirmAssertion,
          confirmChallengeId: confirm.confirmChallengeId,
        };
      } catch {
        seed.fill(0);
        return fail(opts.requestId, "BLOB_UNAVAILABLE");
      } finally {
        healBusy.clear();
      }
      busy = beginBusy(opts.requestId, "Restoring your wallet…");
    }

    seed.fill(0);

    let expiresAt: number;
    try {
      ({ expiresAt } = await pushBackup({
        encryptedWalletBlob: bytesToBase64(raw, "url"),
        publicKey: pk,
        putChallengeId: backup.challengeId,
        putSignature,
        ...heal,
      }));
    } catch {
      return fail(opts.requestId, "BLOB_UNAVAILABLE");
    }
    busy.clear();
    await ui.showSuccess(pk, false);
    ok(opts.requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      created: false,
      expiresAt,
    });
  } catch (e) {
    disc.prfOutput.fill(0);
    if (busy.wasDismissed()) return;
    throw e;
  } finally {
    busy.clear();
  }
}

async function handleAuth(opts: {
  requestId: string;
  rpId: string;
  authMode: "create" | "unlock" | undefined;
  credentialIdB64: string | undefined;
  webauthnAttestationObject: string | undefined;
}): Promise<void> {
  const {
    requestId,
    rpId,
    authMode,
    credentialIdB64,
    webauthnAttestationObject,
  } = opts;

  if (authMode === "create") {
    if (!credentialIdB64 || !webauthnAttestationObject) {
      return fail(requestId, "INVALID_MESSAGE");
    }
    return handleCreate({
      requestId,
      credentialIdB64,
      webauthnAttestationObject,
    });
  }

  const local = readLocalBlob();
  if (local) {
    return handleLocalUnlock({
      requestId,
      rpId,
      raw: local.raw,
      parsed: local.parsed,
    });
  }

  return handleRemoteUnlock({ requestId, rpId });
}

/** Sign / export: prefer signer LS; if empty, one WebAuthn restores from D1 then continues. */
async function restoreWalletSeed(opts: {
  requestId: string;
  rpId: string;
}): Promise<
  | {
      raw: Uint8Array;
      parsed: ParsedWalletBlob;
      seed: Uint8Array;
      publicKey: Uint8Array;
    }
  | "failed"
  | "dismissed"
> {
  let restore: { challengeId: string; challenge: string };
  try {
    restore = await issueRestoreChallenge();
  } catch {
    fail(opts.requestId, "BLOB_UNAVAILABLE");
    return "failed";
  }

  let fetchChallengeBytes: Uint8Array;
  try {
    fetchChallengeBytes = base64ToBytes(restore.challenge, 64, "url");
  } catch {
    fail(opts.requestId, "INVALID_MESSAGE");
    return "failed";
  }

  const busy = beginBusy(opts.requestId, "Use Face ID or Touch ID to approve");
  let disc;
  try {
    disc = await prf.getDiscoverable(opts.rpId, fetchChallengeBytes);
    if (busy.wasDismissed()) return "dismissed";

    let restored;
    try {
      restored = await restoreOwnerWalletBlob({
        challengeId: restore.challengeId,
        assertion: disc.assertion as unknown as Record<string, unknown>,
      });
    } catch {
      disc.prfOutput.fill(0);
      fail(opts.requestId, "BLOB_UNAVAILABLE");
      return "failed";
    }
    if (!restored) {
      disc.prfOutput.fill(0);
      fail(opts.requestId, "BLOB_UNAVAILABLE");
      return "failed";
    }

    const raw = base64ToBytes(restored.encryptedWalletBlob, 1024, "url");
    const parsed = parseBlob(raw);
    if (!bytesEqual(parsed.credentialId, disc.credentialId)) {
      disc.prfOutput.fill(0);
      fail(opts.requestId, "WALLET_MISMATCH");
      return "failed";
    }
    const { seed, publicKey } = await unwrapWallet(
      disc.prfOutput,
      parsed,
      opts.rpId,
    );
    disc.prfOutput.fill(0);
    if (!writeLocalBlob(raw)) {
      seed.fill(0);
      fail(opts.requestId, "INTERNAL_ERROR");
      return "failed";
    }
    return { raw, parsed, seed, publicKey };
  } catch (e) {
    if (disc) disc.prfOutput.fill(0);
    if (busy.wasDismissed()) return "dismissed";
    if (e instanceof ServiceError) {
      fail(opts.requestId, e.code);
      return "failed";
    }
    throw e;
  } finally {
    busy.clear();
  }
}

async function handleSign(
  requestId: string,
  rpId: string,
  txB64: string,
): Promise<void> {
  const txBytes = base64ToBytes(txB64, MAX_TX_BYTES, "std");

  let tx;
  try {
    tx = decodeV1Transaction(txBytes);
  } catch {
    return fail(requestId, "MALFORMED_TRANSACTION");
  }

  const frozen = tx.messageBytes.slice();
  const digest = await digestHex(frozen);
  const local = readLocalBlob();

  let seed: Uint8Array;
  let publicKey: Uint8Array;

  if (local) {
    const policy = evaluatePolicy(tx, local.parsed.publicKey);
    if (!policy.ok) return fail(requestId, policy.code);

    if (!(await ui.confirmSignTransaction(policy.summary)))
      return fail(requestId, "USER_CANCELLED");

    state.authorize({
      operation: "SIGN_PENDING",
      requestId,
      walletPublicKey: local.parsed.publicKey,
      messageDigest: digest,
      createdAt: Date.now(),
    });

    const busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
    try {
      const unlocked = await decryptWallet(prf, rpId, local.parsed);

      if (busy.wasDismissed()) {
        unlocked.seed.fill(0);
        return;
      }
      seed = unlocked.seed;
      publicKey = unlocked.publicKey;
    } catch (e) {
      if (busy.wasDismissed()) return;
      throw e;
    } finally {
      busy.clear();
    }
  } else {
    // Cold start / empty LS: confirm with preview, one WebAuthn restores + unlocks.
    const preview = previewPolicy(tx);
    if (!preview.ok) return fail(requestId, preview.code);

    if (!(await ui.confirmSignTransaction(preview.summary))) {
      return fail(requestId, "USER_CANCELLED");
    }

    const restored = await restoreWalletSeed({ requestId, rpId });
    if (restored === "failed" || restored === "dismissed") return;

    const policy = evaluatePolicy(tx, restored.publicKey);
    if (!policy.ok) {
      restored.seed.fill(0);
      return fail(requestId, policy.code);
    }

    state.authorize({
      operation: "SIGN_PENDING",
      requestId,
      walletPublicKey: restored.publicKey,
      messageDigest: digest,
      createdAt: Date.now(),
    });
    seed = restored.seed;
    publicKey = restored.publicKey;
  }

  try {
    const auth = state.consumeAuthorization({
      operation: "SIGN_PENDING",
      requestId,
      messageDigest: await digestHex(frozen),
    });
    if (!auth) {
      seed.fill(0);
      return fail(requestId, "INTERNAL_ERROR");
    }

    const signature = signAndScrub(frozen, seed);

    ok(requestId, RESULT_TYPE.SIGN_TRANSACTION, {
      signature: bytesToBase64(signature, "std"),
      publicKey: toBase58Pubkey(publicKey),
    });
  } catch (e) {
    seed.fill(0);
    throw e;
  }
}

async function handleExportPrivateKey(
  requestId: string,
  rpId: string,
): Promise<void> {
  if (!(await ui.confirmExportPrivateKey()))
    return fail(requestId, "USER_CANCELLED");

  const local = readLocalBlob();
  let seed: Uint8Array;
  let publicKey: Uint8Array;

  if (local) {
    const busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
    try {
      const unlocked = await decryptWallet(prf, rpId, local.parsed);

      if (busy.wasDismissed()) {
        unlocked.seed.fill(0);
        return;
      }
      seed = unlocked.seed;
      publicKey = unlocked.publicKey;
    } catch (e) {
      if (busy.wasDismissed()) return;
      throw e;
    } finally {
      busy.clear();
    }
  } else {
    const restored = await restoreWalletSeed({ requestId, rpId });
    if (restored === "failed" || restored === "dismissed") return;
    seed = restored.seed;
    publicKey = restored.publicKey;
  }

  try {
    const secret = new Uint8Array(64);
    secret.set(seed, 0);
    secret.set(publicKey, 32);
    const secretB58 = b58.decode(secret);
    seed.fill(0);
    secret.fill(0);
    await ui.showExportedSecret(secretB58, toBase58Pubkey(publicKey));
    ok(requestId, RESULT_TYPE.EXPORT_PRIVATE_KEY, { completed: true });
  } catch (e) {
    seed.fill(0);
    throw e;
  }
}

function codeOf(e: unknown): ErrorCode {
  if (e instanceof ServiceError) return e.code;
  if (e instanceof WebAuthnUnsupported) return "UNSUPPORTED_CREDENTIAL";
  if (
    e instanceof DOMException &&
    (e.name === "NotAllowedError" || e.name === "AbortError")
  ) {
    return "USER_CANCELLED";
  }
  return "INTERNAL_ERROR";
}

// Signal readiness so the parent knows the signer is listening.
ui.renderIdle();
post({ type: "SIGNER_READY", protocolVersion: 1 });
