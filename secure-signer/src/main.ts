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
  AUTH_BLOB_WAIT_MS,
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
import { evaluatePolicy } from "./tx/policy.js";
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

type BlobReply = Extract<InboundRequest, { type: "BLOB_PROVIDED" }>;
const blobWaiters = new Map<
  string,
  { resolve: (r: BlobReply) => void; reject: (e: Error) => void }
>();

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

/** Sign a base64url challenge with the seed; returns base64url sig or undefined. */
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

function waitForBlobProvided(
  requestId: string,
  timeoutMs = AUTH_BLOB_WAIT_MS,
): Promise<BlobReply> {
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
    const replay = state.checkFreshnessAndReplay(
      request.requestId,
      request.timestamp,
      {
        continuation: true,
      },
    );
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

  // Sensitive, interactive flows — one at a time (§15, §33).
  const opFor = {
    AUTH_START: "AUTH_PENDING",
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
          request.putChallenge,
          request.fetchChallenge,
          request.authMode,
          request.credentialId,
        );
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
    const waiter = blobWaiters.get(request.requestId);
    if (waiter) {
      blobWaiters.delete(request.requestId);
      waiter.reject(new Error("cancelled"));
    }
    state.end();
    ui.renderIdle();
  }
}

async function enrollFromParentCredential(opts: {
  requestId: string;
  credentialIdB64: string;
  putChallengeB64?: string;
}): Promise<void> {
  // Parent create used up user activation; require an in-iframe tap before get.
  if (!(await ui.confirmFinishCreate())) {
    return fail(opts.requestId, "USER_CANCELLED");
  }

  const busy = beginBusy(
    opts.requestId,
    "Confirm with your passkey to finish setup…",
  );
  try {
    let messageToSign: Uint8Array | undefined;
    if (opts.putChallengeB64) {
      try {
        messageToSign = prefixedChallengeMessage(
          PUT_CHALLENGE_PREFIX,
          base64ToBytes(opts.putChallengeB64, 64, "url"),
        );
      } catch {
        return fail(opts.requestId, "INVALID_MESSAGE");
      }
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
      {
        ...(messageToSign ? { messageToSign } : {}),
      },
    );
    if (busy.wasDismissed()) return;
    if (opts.putChallengeB64 && !created.signature) {
      return fail(opts.requestId, "INTERNAL_ERROR");
    }
    writeLocalBlob(created.blob);
    const pk = toBase58Pubkey(created.publicKey);
    const putSignature = created.signature
      ? bytesToBase64(created.signature, "url")
      : undefined;
    await ui.showSuccess(pk, true);
    if (busy.wasDismissed()) return;
    ok(opts.requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(created.blob, "url"),
      created: true,
      ...(putSignature ? { putSignature } : {}),
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
        return enrollFromParentCredential(opts);
      }
      return fail(opts.requestId, "USER_CANCELLED");
    }
    throw e;
  } finally {
    busy.clear();
  }
}

async function handleAuth(
  requestId: string,
  rpId: string,
  putChallengeB64: string | undefined,
  fetchChallengeB64: string | undefined,
  authMode: "create" | "unlock" | undefined,
  credentialIdB64: string | undefined,
): Promise<void> {
  // Passkey create happens on the app (shared RP ID). Parent must send credentialId.
  if (authMode === "create") {
    if (!credentialIdB64) {
      return fail(requestId, "INVALID_MESSAGE");
    }
    await enrollFromParentCredential({
      requestId,
      credentialIdB64,
      ...(putChallengeB64 ? { putChallengeB64 } : {}),
    });
    return;
  }

  const local = readLocalBlob();
  if (local) {
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

  // fetchChallenge is the WebAuthn challenge — same ceremony unlocks PRF and
  // authorizes blob restore (parent posts assertion to POST .../blob/restore).
  if (!fetchChallengeB64) {
    return fail(requestId, "INVALID_MESSAGE");
  }
  let fetchChallengeBytes: Uint8Array;
  try {
    fetchChallengeBytes = base64ToBytes(fetchChallengeB64, 64, "url");
  } catch {
    return fail(requestId, "INVALID_MESSAGE");
  }

  if (!(await ui.confirmImport())) return fail(requestId, "USER_CANCELLED");
  let busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
  let disc;
  try {
    disc = await prf.getDiscoverable(rpId, fetchChallengeBytes);
    if (busy.wasDismissed()) return;
  } catch {
    busy.clear();
    if (busy.wasDismissed()) return;
    const again = await ui.showRecoverable(
      "No wallet was found on this device. Create a passkey, or try again if you cancelled the prompt.",
    );
    if (again === "retry") {
      return handleAuth(
        requestId,
        rpId,
        putChallengeB64,
        fetchChallengeB64,
        "unlock",
        undefined,
      );
    }
    return fail(requestId, "BLOB_UNAVAILABLE");
  }
  busy.clear();

  post({
    type: "BLOB_NEEDED",
    requestId,
    credentialId: bytesToBase64(disc.credentialId, "url"),
    assertion: disc.assertion,
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
      return handleAuth(
        requestId,
        rpId,
        putChallengeB64,
        fetchChallengeB64,
        "unlock",
        undefined,
      );
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
    const { seed, publicKey } = await unwrapWallet(
      disc.prfOutput,
      parsed,
      rpId,
    );
    disc.prfOutput.fill(0);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    const putSignature = signChallenge(
      putChallengeB64,
      seed,
      PUT_CHALLENGE_PREFIX,
    );
    seed.fill(0);
    if (putChallengeB64 && !putSignature) {
      return fail(requestId, "INTERNAL_ERROR");
    }
    writeLocalBlob(raw);
    const pk = toBase58Pubkey(publicKey);
    busy.clear();
    await ui.showSuccess(pk, false);
    ok(requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(raw, "url"),
      created: false,
      ...(putSignature ? { putSignature } : {}),
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
  const busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
  try {
    const { seed, publicKey } = await decryptWallet(prf, rpId, parsed);
    if (busy.wasDismissed()) {
      seed.fill(0);
      return;
    }
    const putSignature = signChallenge(
      putChallengeB64,
      seed,
      PUT_CHALLENGE_PREFIX,
    );
    seed.fill(0);
    if (putChallengeB64 && !putSignature) {
      return fail(requestId, "INTERNAL_ERROR");
    }
    if (writeLocal) writeLocalBlob(raw);
    const pk = toBase58Pubkey(publicKey);
    await ui.showSuccess(pk, false);
    if (busy.wasDismissed()) return;
    ok(requestId, RESULT_TYPE.AUTH_START, {
      publicKey: pk,
      encryptedWalletBlob: bytesToBase64(raw, "url"),
      created: false,
      ...(putSignature ? { putSignature } : {}),
    });
  } catch (e) {
    if (busy.wasDismissed()) return;
    const code = codeOf(e);
    if (code === "AUTHENTICATION_FAILED" || code === "DECRYPTION_FAILED") {
      const again = await ui.showRecoverable(
        "Passkey authentication didn’t work. Try again, or cancel if this passkey was removed from this phone.",
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
      // Distinct from dismiss-before-biometric so the parent can offer create.
      return fail(requestId, "AUTHENTICATION_FAILED");
    }
    throw e;
  } finally {
    busy.clear();
  }
}

/** Sign / export use signer-origin localStorage only — parent never supplies ciphertext. */
function requireLocalBlob(): {
  raw: Uint8Array;
  parsed: ParsedWalletBlob;
} {
  const local = readLocalBlob();
  if (!local) throw new ServiceError("INVALID_WALLET_BLOB");
  return local;
}

async function handleSign(
  requestId: string,
  rpId: string,
  txB64: string,
): Promise<void> {
  const { parsed } = requireLocalBlob();
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

  const busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
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
    ok(requestId, RESULT_TYPE.SIGN_TRANSACTION, {
      signature: bytesToBase64(signature, "std"),
      publicKey: toBase58Pubkey(parsed.publicKey),
    });
  } finally {
    busy.clear();
  }
}

async function handleExportPrivateKey(
  requestId: string,
  rpId: string,
): Promise<void> {
  const { parsed } = requireLocalBlob();
  // Dedicated ceremony BEFORE WebAuthn (§14) — warning + explicit continue.
  if (!(await ui.confirmExportPrivateKey()))
    return fail(requestId, "USER_CANCELLED");
  const busy = beginBusy(requestId, "Use Face ID or Touch ID to approve");
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
    // Key stays in memory for clipboard copy only — never posted to parent.
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
