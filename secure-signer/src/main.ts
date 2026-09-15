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
import { EXPECTED_PARENT_ORIGIN, MAX_TX_BYTES } from "./constants.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
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
import { BrowserPrfProvider, currentRpId } from "./webauthn.js";
import {
  createWallet,
  decryptWallet,
  parseBlob,
  ServiceError,
  signAndScrub,
} from "./wallet-service.js";
import * as ui from "./ui/ui.js";

const addr = getAddressDecoder();
const b58 = getBase58Decoder();
const prf = new BrowserPrfProvider();
const state = new SignerState();

const toBase58Pubkey = (bytes: Uint8Array): string => addr.decode(bytes);

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
    CREATE_KEY: "CREATE_PENDING",
    IMPORT_KEY: "IMPORT_PENDING",
    SIGN_TRANSACTION: "SIGN_PENDING",
    EXPORT_PRIVATE_KEY: "PRIVATE_EXPORT_PENDING",
  } as const;
  if (!state.begin(opFor[request.type], request.requestId)) {
    fail(request.requestId, "INTERNAL_ERROR"); // busy: another flow active
    return;
  }
  try {
    switch (request.type) {
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
    state.end();
    ui.renderIdle();
  }
}

async function handleCreate(requestId: string, rpId: string): Promise<void> {
  if (!(await ui.confirmCreate())) return fail(requestId, "USER_CANCELLED");
  ui.renderBusy("Follow your device's passkey prompt…");
  const { publicKey, blob } = await createWallet(prf, rpId);
  ok(requestId, RESULT_TYPE.CREATE_KEY, {
    publicKey: toBase58Pubkey(publicKey),
    encryptedWalletBlob: bytesToBase64(blob, "url"),
  });
}

async function handleImport(
  requestId: string,
  rpId: string,
  blobB64: string,
): Promise<void> {
  const parsed = parseBlob(base64ToBytes(blobB64, 1024, "url"));
  if (!(await ui.confirmImport())) return fail(requestId, "USER_CANCELLED");
  ui.renderBusy("Follow your device's passkey prompt…");
  const { seed, publicKey } = await decryptWallet(prf, rpId, parsed);
  seed.fill(0); // import does not need the seed
  ui.showRestored(toBase58Pubkey(publicKey));
  ok(requestId, RESULT_TYPE.IMPORT_KEY, {
    publicKey: toBase58Pubkey(publicKey),
    verified: true,
  });
}

async function handleSign(
  requestId: string,
  rpId: string,
  blobB64: string,
  txB64: string,
): Promise<void> {
  const parsed = parseBlob(base64ToBytes(blobB64, 1024, "url"));
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

  ui.renderBusy("Follow your device's passkey prompt…");
  const { seed } = await decryptWallet(prf, rpId, parsed); // fresh WebAuthn (§24)

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
}

async function handleExportPrivateKey(
  requestId: string,
  rpId: string,
  blobB64: string,
): Promise<void> {
  const parsed = parseBlob(base64ToBytes(blobB64, 1024, "url"));
  // Dedicated ceremony with typed confirmation BEFORE WebAuthn (§14).
  if (!(await ui.confirmExportPrivateKey()))
    return fail(requestId, "USER_CANCELLED");
  ui.renderBusy("Follow your device's passkey prompt…");
  const { seed, publicKey } = await decryptWallet(prf, rpId, parsed); // fresh WebAuthn
  // Standard Solana 64-byte secret key = seed || publicKey, base58.
  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(publicKey, 32);
  const secretB58 = b58.decode(secret);
  seed.fill(0);
  secret.fill(0);
  // Plaintext key is revealed ONLY in-iframe; NEVER posted to the parent (§14).
  ui.showExportedSecret(secretB58, toBase58Pubkey(publicKey));
  ok(requestId, RESULT_TYPE.EXPORT_PRIVATE_KEY, { completed: true });
}

function codeOf(e: unknown): ErrorCode {
  if (e instanceof ServiceError) return e.code;
  return "INTERNAL_ERROR";
}

// Signal readiness so the parent knows the signer is listening.
ui.renderIdle();
post({ type: "SIGNER_READY", protocolVersion: 1 });
