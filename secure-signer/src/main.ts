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
import { pickForAuth, pickForSensitiveOp } from "./blob-merge.js";
import { readLocalBlob, writeLocalBlob } from "./blob-store.js";
import { EXPECTED_PARENT_ORIGIN, MAX_TX_BYTES, PUT_CHALLENGE_PREFIX } from "./constants.js";
import { base64ToBytes, bytesEqual, bytesToBase64, utf8ToBytes } from "./encoding.js";
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
import { evaluatePolicy } from "./tx/policy.js";
import { BrowserPrfProvider, currentRpId, WebAuthnUnsupported } from "./webauthn.js";
import {
  createWallet,
  decryptWallet,
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

type BlobReply = Extract<InboundRequest, { type: "BLOB_PROVIDED" }>;
const blobWaiters = new Map<
  string,
  { resolve: (r: BlobReply) => void; reject: (e: Error) => void }
>();

const toBase58Pubkey = (bytes: Uint8Array): string => addr.decode(bytes);

function putChallengeMessage(challengeBytes: Uint8Array): Uint8Array {
  const prefix = utf8ToBytes(PUT_CHALLENGE_PREFIX);
  const out = new Uint8Array(prefix.length + challengeBytes.length);
  out.set(prefix, 0);
  out.set(challengeBytes, prefix.length);
  return out;
}

/** Sign a PUT challenge with the seed; returns base64url sig or undefined. */
function signPutChallenge(
  putChallengeB64: string | undefined,
  seed: Uint8Array,
): string | undefined {
  if (!putChallengeB64) return undefined;
  try {
    const challengeBytes = base64ToBytes(putChallengeB64, 64, "url");
    const sig = ed25519Sign(putChallengeMessage(challengeBytes), seed);
    return bytesToBase64(sig, "url");
  } catch {
    return undefined;
  }
}

function authCompleteExtra(putSignature: string | undefined): Record<string, unknown> {
  return putSignature ? { putSignature } : {};
}

/** Show busy UI with an X that cancels the in-flight request. */
function beginBusy(requestId: string, message: string) {
  let dismissed = false;
  ui.setBusyDismiss(() => {
    if (dismissed) return;
    dismissed = true;
    const waiter = blobWaiters.get(requestId);
    if (waiter) {
      blobWaiters.delete(requestId);
      waiter.reject(new Error("cancelled"));
    }
    fail(requestId, "USER_CANCELLED");
  });
  ui.renderBusy(message);
  return {
    wasDismissed: () => dismissed,
    clear: () => ui.setBusyDismiss(null),
  };
}

function post(message: Record<string, unknown>): void {
  // Never "*" (§9): results go only to the expected parent origin.
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

function parseRemoteBlob(
  blobB64: string | undefined,
): { raw: Uint8Array; parsed: ParsedWalletBlob } | null {
  if (!blobB64) return null;
  try {
    const raw = base64ToBytes(blobB64, 1024, "url");
    return { raw, parsed: parseBlob(raw) };
  } catch {
    return null;
  }
}

function waitForBlobProvided(requestId: string, timeoutMs = 30_000): Promise<BlobReply> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      blobWaiters.delete(requestId);
      reject(new ServiceError("BLOB_UNAVAILABLE"));
    }, timeoutMs);
    blobWaiters.set(requestId, {
      resolve: (r) => {
        window.clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    });
  });
}

window.addEventListener("message", (event: MessageEvent) => {
  // 1. Origin AND source (§9). Neither proves benignity (§2), both are required.
  if (event.origin !== EXPECTED_PARENT_ORIGIN) return;
  if (event.source !== window.parent) return;

  // 2. Strict schema.
  const validation = validateInbound(event.data);
  if (!validation.ok) {
    fail(validation.requestId, validation.code);
    return;
  }
  const request = validation.request;

  // BLOB_PROVIDED continues an in-flight AUTH_START — resolve the waiter only.
  if (request.type === "BLOB_PROVIDED") {
    const replay = state.checkFreshnessAndReplay(request.requestId, request.timestamp, {
      continuation: true,
    });
    if (replay) {
      fail(request.requestId, replay);
      return;
    }
    const waiter = blobWaiters.get(request.requestId);
    if (waiter) {
      blobWaiters.delete(request.requestId);
      waiter.resolve(request);
    }
    return;
  }

  // 3. Replay + freshness.
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
    // Any unexpected throw -> generic error; never leak internals (§31).
    fail(request.requestId, "INTERNAL_ERROR");
    state.end();
    ui.renderIdle();
  });
});

async function handle(request: InboundRequest): Promise<void> {
  const rpId = currentRpId();

  // GET_PUBLIC_KEY and EXPORT_ENCRYPTED_WALLET are non-sensitive (public data),
  // need no WebAuthn, and do not occupy the operation slot.
  if (request.type === "GET_PUBLIC_KEY") {
    try {
      const parsed = parseBlob(
        base64ToBytes(request.encryptedWalletBlob, 1024, "url"),
      );
      // NOTE: unverified — the authoritative key comes from CREATE/IMPORT/SIGN.
      ok(request.requestId, RESULT_TYPE.GET_PUBLIC_KEY, {
        publicKey: toBase58Pubkey(parsed.publicKey),
        verified: false,
      });
    } catch (e) {
      fail(request.requestId, codeOf(e));
    }
    return;
  }

  if (request.type === "EXPORT_ENCRYPTED_WALLET") {
    try {
      const raw = base64ToBytes(request.encryptedWalletBlob, 1024, "url");
      parseBlob(raw); // structural validation only; ciphertext is non-secret (§13)
      ok(request.requestId, RESULT_TYPE.EXPORT_ENCRYPTED_WALLET, {
        encryptedWalletBlob: bytesToBase64(raw, "url"),
      });
    } catch (e) {
      fail(request.requestId, codeOf(e));
    }
    return;
  }

  // Sensitive, interactive flows — one at a time (§15, §33).
  const opFor = {
    AUTH_START: "AUTH_PENDING",
    CREATE_KEY: "CREATE_PENDING",
    IMPORT_KEY: "IMPORT_PENDING",
    SIGN_TRANSACTION: "SIGN_PENDING",
    EXPORT_PRIVATE_KEY: "PRIVATE_EXPORT_PENDING",
  } as const;

  if (!(request.type in opFor)) {
    fail(request.requestId, "INVALID_MESSAGE");
    return;
  }

  const op = opFor[request.type as keyof typeof opFor];
  if (!state.begin(op, request.requestId)) {
    fail(request.requestId, "INTERNAL_ERROR"); // busy: another flow active
    return;
  }
  try {
    switch (request.type) {
      case "AUTH_START":
        await handleAuth(
          request.requestId,
          rpId,
          request.encryptedWalletBlob,
          request.putChallenge,
        );
        break;
      case "CREATE_KEY":
        await handleCreate(request.requestId, rpId);
        break;
      case "IMPORT_KEY":
        await handleImport(
          request.requestId,
          rpId,
          request.encryptedWalletBlob,
        );
        break;
      case "SIGN_TRANSACTION":
        await handleSign(
          request.requestId,
          rpId,
          request.encryptedWalletBlob,
          request.transaction,
        );
        break;
      case "EXPORT_PRIVATE_KEY":
        await handleExportPrivateKey(
          request.requestId,
          rpId,
          request.encryptedWalletBlob,
        );
        break;
    }
  } catch (e) {
    fail(request.requestId, codeOf(e));
  } finally {
    const waiter = blobWaiters.get(request.requestId);
    if (waiter) {
      blobWaiters.delete(request.requestId);
      waiter.reject(new Error("cancelled"));
    }
    state.end();
    ui.renderIdle();
  }
}

async function handleAuth(
  requestId: string,
  rpId: string,
  remoteBlobB64: string | undefined,
  putChallengeB64: string | undefined,
): Promise<void> {
  const local = readLocalBlob();
  const remote = parseRemoteBlob(remoteBlobB64);
  // Corrupt remote from parent is ignored (treated as missing), not fatal.
  const hasWallet = !!(local || remote);

  // Local wallet already on this phone → skip the create/unlock chooser so
  // parent "Continue" doesn't immediately re-ask the same decision.
  const choice = local
    ? "signin"
    : await ui.confirmChooser(hasWallet);
  if (choice === "cancel") return fail(requestId, "USER_CANCELLED");

  if (choice === "create") {
    const account = await ui.confirmCreate(!!local);
    if (!account) return fail(requestId, "USER_CANCELLED");
    const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
    try {
      // Parse PUT challenge BEFORE WebAuthn — never retry createWallet after a
      // failed enrollment (would re-prompt and orphan the first credential).
      let messageToSign: Uint8Array | undefined;
      if (putChallengeB64) {
        try {
          messageToSign = putChallengeMessage(
            base64ToBytes(putChallengeB64, 64, "url"),
          );
        } catch {
          /* backup proof is best-effort — still create the wallet */
        }
      }
      const created = await createWallet(prf, rpId, {
        userName: account.userName,
        ...(messageToSign ? { messageToSign } : {}),
      });
      if (busy.wasDismissed()) return;
      const { publicKey, blob, signature } = created;
      writeLocalBlob(blob);
      const pk = toBase58Pubkey(publicKey);
      const putSignature = signature
        ? bytesToBase64(signature, "url")
        : undefined;
      await ui.showSuccess(pk, true);
      if (busy.wasDismissed()) return;
      ok(requestId, RESULT_TYPE.AUTH_START, {
        publicKey: pk,
        encryptedWalletBlob: bytesToBase64(blob, "url"),
        created: true,
        ...authCompleteExtra(putSignature),
      });
    } catch (e) {
      if (busy.wasDismissed()) return;
      throw e;
    } finally {
      busy.clear();
    }
    return;
  }

  // Sign in
  const pick = pickForAuth(local?.parsed ?? null, remote?.parsed ?? null);

  if (pick.kind === "conflict") {
    const decision = await ui.confirmConflict();
    if (decision === "cancel" || !local) return fail(requestId, "USER_CANCELLED");
    await unlockAndComplete(
      requestId,
      rpId,
      local.raw,
      local.parsed,
      false,
      putChallengeB64,
    );
    return;
  }

  if (pick.kind === "use") {
    const raw =
      pick.source === "local" && local
        ? local.raw
        : remote!.raw;
    await unlockAndComplete(
      requestId,
      rpId,
      raw,
      pick.parsed,
      pick.writeLocal,
      putChallengeB64,
    );
    return;
  }

  // No local/remote blob: discoverable passkey → ask parent for ciphertext.
  if (!(await ui.confirmImport())) return fail(requestId, "USER_CANCELLED");
  let busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  let disc;
  try {
    disc = await prf.getDiscoverable(rpId);
    if (busy.wasDismissed()) return;
  } catch {
    busy.clear();
    if (busy.wasDismissed()) return;
    const again = await ui.showRecoverable(
      "No wallet was found on this device. Create a passkey, or try again if you cancelled the prompt.",
    );
    if (again === "retry") {
      return handleAuth(requestId, rpId, remoteBlobB64, putChallengeB64);
    }
    return fail(requestId, "BLOB_UNAVAILABLE");
  }
  busy.clear();

  post({
    type: "BLOB_NEEDED",
    requestId,
    credentialId: bytesToBase64(disc.credentialId, "url"),
  });
  busy = beginBusy(requestId, "Restoring your wallet…");

  let reply: BlobReply;
  try {
    reply = await waitForBlobProvided(requestId);
    if (busy.wasDismissed()) {
      disc.prfOutput.fill(0);
      return;
    }
  } catch {
    disc.prfOutput.fill(0);
    busy.clear();
    if (busy.wasDismissed()) return;
    return fail(requestId, "BLOB_UNAVAILABLE");
  }

  if (reply.errorCode || !reply.encryptedWalletBlob) {
    disc.prfOutput.fill(0);
    busy.clear();
    if (busy.wasDismissed()) return;
    const again = await ui.showRecoverable(
      "No backup wallet was found for this passkey on this app. Create a passkey on this device, or unlock where the wallet was created.",
    );
    if (again === "retry") {
      return handleAuth(requestId, rpId, remoteBlobB64, putChallengeB64);
    }
    return fail(requestId, reply.errorCode ?? "BLOB_UNAVAILABLE");
  }

  try {
    const raw = base64ToBytes(reply.encryptedWalletBlob, 1024, "url");
    const parsed = parseBlob(raw);
    if (!bytesEqual(parsed.credentialId, disc.credentialId)) {
      disc.prfOutput.fill(0);
      return fail(requestId, "WALLET_MISMATCH");
    }
    const { seed, publicKey } = await unwrapWallet(disc.prfOutput, parsed, rpId);
    disc.prfOutput.fill(0);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    const putSignature = signPutChallenge(putChallengeB64, seed);
    seed.fill(0);
    writeLocalBlob(raw);
    const pk = toBase58Pubkey(publicKey);
    busy.clear();
    await ui.showSuccess(pk, false);
    ok(requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(raw, "url"),
      created: false,
      ...authCompleteExtra(putSignature),
    });
  } catch (e) {
    disc.prfOutput.fill(0);
    if (busy.wasDismissed()) return;
    throw e;
  } finally {
    busy.clear();
  }
}

async function unlockAndComplete(
  requestId: string,
  rpId: string,
  raw: Uint8Array,
  parsed: ParsedWalletBlob,
  writeLocal: boolean,
  putChallengeB64: string | undefined,
): Promise<void> {
  if (!(await ui.confirmImport())) return fail(requestId, "USER_CANCELLED");
  const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  try {
    const { seed, publicKey } = await decryptWallet(prf, rpId, parsed);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    const putSignature = signPutChallenge(putChallengeB64, seed);
    seed.fill(0);
    if (writeLocal) writeLocalBlob(raw);
    const pk = toBase58Pubkey(publicKey);
    await ui.showSuccess(pk, false);
    if (busy.wasDismissed()) return;
    ok(requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(raw, "url"),
      created: false,
      ...authCompleteExtra(putSignature),
    });
  } catch (e) {
    if (busy.wasDismissed()) return;
    const code = codeOf(e);
    if (code === "AUTHENTICATION_FAILED" || code === "DECRYPTION_FAILED") {
      const again = await ui.showRecoverable(
        "Passkey authentication didn’t work. Try again, or cancel to go back.",
      );
      if (again === "retry") {
        return unlockAndComplete(
          requestId,
          rpId,
          raw,
          parsed,
          writeLocal,
          putChallengeB64,
        );
      }
      return fail(requestId, "USER_CANCELLED");
    }
    throw e;
  } finally {
    busy.clear();
  }
}

async function handleCreate(requestId: string, rpId: string): Promise<void> {
  const local = readLocalBlob();
  const account = await ui.confirmCreate(!!local);
  if (!account) return fail(requestId, "USER_CANCELLED");
  const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  try {
    const { publicKey, blob } = await createWallet(prf, rpId, {
      userName: account.userName,
    });
    if (busy.wasDismissed()) return;
    writeLocalBlob(blob);
    const pk = toBase58Pubkey(publicKey);
    await ui.showSuccess(pk, true);
    if (busy.wasDismissed()) return;
    ok(requestId, RESULT_TYPE.CREATE_KEY, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(blob, "url"),
    });
  } finally {
    busy.clear();
  }
}

async function handleImport(
  requestId: string,
  rpId: string,
  blobB64: string,
): Promise<void> {
  const remote = parseRemoteBlob(blobB64);
  if (!remote) return fail(requestId, "INVALID_WALLET_BLOB");
  const local = readLocalBlob();
  const pick = pickForAuth(local?.parsed ?? null, remote.parsed);
  if (pick.kind === "conflict" && local) {
    const decision = await ui.confirmConflict();
    if (decision === "cancel") return fail(requestId, "USER_CANCELLED");
    await unlockAndCompleteImport(requestId, rpId, local.raw, local.parsed, false);
    return;
  }
  const raw = pick.kind === "use" && pick.source === "local" && local ? local.raw : remote.raw;
  const parsed = pick.kind === "use" ? pick.parsed : remote.parsed;
  const writeLocal = pick.kind === "use" ? pick.writeLocal : true;
  await unlockAndCompleteImport(requestId, rpId, raw, parsed, writeLocal);
}

async function unlockAndCompleteImport(
  requestId: string,
  rpId: string,
  raw: Uint8Array,
  parsed: ParsedWalletBlob,
  writeLocal: boolean,
): Promise<void> {
  if (!(await ui.confirmImport())) return fail(requestId, "USER_CANCELLED");
  const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  try {
    const { seed, publicKey } = await decryptWallet(prf, rpId, parsed);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    seed.fill(0);
    if (writeLocal) writeLocalBlob(raw);
    const pk = toBase58Pubkey(publicKey);
    await ui.showSuccess(pk, false);
    if (busy.wasDismissed()) return;
    ok(requestId, RESULT_TYPE.IMPORT_KEY, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(raw, "url"),
      verified: true,
    });
  } finally {
    busy.clear();
  }
}

function resolveBlobForOp(parentBlobB64: string): {
  raw: Uint8Array;
  parsed: ParsedWalletBlob;
} {
  const remote = parseRemoteBlob(parentBlobB64);
  const local = readLocalBlob();
  const chosen = pickForSensitiveOp(local?.parsed ?? null, remote?.parsed ?? null);
  if (!chosen) throw new ServiceError("INVALID_WALLET_BLOB");
  if (local && bytesEqual(local.parsed.publicKey, chosen.publicKey)) {
    return local;
  }
  if (remote && bytesEqual(remote.parsed.publicKey, chosen.publicKey)) {
    return remote;
  }
  throw new ServiceError("INVALID_WALLET_BLOB");
}

async function handleSign(
  requestId: string,
  rpId: string,
  blobB64: string,
  txB64: string,
): Promise<void> {
  const { parsed } = resolveBlobForOp(blobB64);
  const txBytes = base64ToBytes(txB64, MAX_TX_BYTES, "std");

  // Independent decode + policy from the signer's OWN parser (§17).
  let tx;
  try {
    tx = decodeV1Transaction(txBytes);
  } catch {
    return fail(requestId, "MALFORMED_TRANSACTION");
  }
  const policy = evaluatePolicy(tx, parsed.publicKey);
  if (!policy.ok) return fail(requestId, policy.code);

  // Freeze the exact validated bytes; bind authorization to their digest (§22).
  const frozen = tx.messageBytes.slice();
  const digest = await digestHex(frozen);

  if (!(await ui.confirmSignTransaction(policy.summary)))
    return fail(requestId, "USER_CANCELLED");
  state.authorize({
    operation: "SIGN_PENDING",
    requestId,
    walletPublicKey: parsed.publicKey,
    messageDigest: digest,
    createdAt: Date.now(),
  });

  const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  try {
    const { seed } = await decryptWallet(prf, rpId, parsed); // fresh WebAuthn (§24)
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }

    // Re-verify the authorization against the SAME frozen bytes (no swap, §22).
    const auth = state.consumeAuthorization({
      operation: "SIGN_PENDING",
      requestId,
      messageDigest: await digestHex(frozen),
    });
    if (!auth) {
      seed.fill(0);
      return fail(requestId, "INTERNAL_ERROR");
    }

    const signature = signAndScrub(frozen, seed); // signs EXACT validated bytes

    // Place the signature in its slot in the original tx and return.
    const signed = txBytes.slice();
    signed.set(
      signature,
      tx.signaturesOffset + policy.summary.ownerSignerIndex * 64,
    );
    ok(requestId, RESULT_TYPE.SIGN_TRANSACTION, {
      signature: bytesToBase64(signature, "std"),
      publicKey: toBase58Pubkey(parsed.publicKey),
      signedTransaction: bytesToBase64(signed, "std"),
    });
  } finally {
    busy.clear();
  }
}

async function handleExportPrivateKey(
  requestId: string,
  rpId: string,
  blobB64: string,
): Promise<void> {
  const { parsed } = resolveBlobForOp(blobB64);
  // Dedicated ceremony with typed confirmation BEFORE WebAuthn (§14).
  if (!(await ui.confirmExportPrivateKey()))
    return fail(requestId, "USER_CANCELLED");
  const busy = beginBusy(requestId, "Follow your device’s passkey prompt…");
  try {
    const { seed, publicKey } = await decryptWallet(prf, rpId, parsed); // fresh WebAuthn
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    // Standard Solana 64-byte secret key = seed || publicKey, base58.
    const secret = new Uint8Array(64);
    secret.set(seed, 0);
    secret.set(publicKey, 32);
    const secretB58 = b58.decode(secret);
    seed.fill(0);
    secret.fill(0);
    busy.clear();
    // Plaintext key is revealed ONLY in-iframe; NEVER posted to the parent (§14).
    // Await Done so the parent overlay stays up until the user dismisses.
    await ui.showExportedSecret(secretB58, toBase58Pubkey(publicKey));
    ok(requestId, RESULT_TYPE.EXPORT_PRIVATE_KEY, { completed: true });
  } catch (e) {
    if (busy.wasDismissed()) return;
    throw e;
  } finally {
    busy.clear();
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
