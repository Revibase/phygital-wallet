/**
 * Owner wallet encrypted-blob backup (D1).
 *
 * Fetch — WebAuthn assertion over a server challenge (same ceremony as PRF
 * unlock in the secure-signer). Ciphertext is returned only after verify.
 * PUT — ed25519 signature over a server challenge from the secure-signer
 *       (proves possession of the wallet). Create requires attestationObject
 *       whose credential ID matches the blob header (binds COSE to the passkey).
 *       On success also mints the owner_session cookie (same proof = signed in).
 */
import { Hono } from "hono";
import { getAddressDecoder } from "@solana/kit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { auditMeta, recordAudit } from "@/audit/audit-log";
import { issueOwnerSessionCookie } from "@/auth/owner-session";
import { verifyConsumedChallengeProof } from "@/auth/possession-proof";
import { timingSafeEqual } from "@/auth/session-hmac";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  MAX_CREDENTIAL_ID_BYTES,
  MAX_OWNER_BLOB_BYTES,
  OwnerBlobParseError,
  parseOwnerBlobHeader,
  sha256Hex,
} from "@/owner-wallet/blob-format";
import {
  consumeBackupChallenge,
  consumeRestoreChallenge,
  issueBackupChallenge,
  issueRestoreChallenge,
  backupChallengeMessage,
} from "@/owner-wallet/challenge";
import {
  getOwnerWalletBlob,
  putOwnerWalletBlob,
} from "@/owner-wallet/blob-store";
import {
  extractCredentialFromAttestationObject,
  resolveWebAuthnRpId,
  verifyOwnerWalletAssertion,
} from "@/owner-wallet/verify-webauthn-assertion";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
import { isAppBrowserOrigin } from "@/shared/cors";
import { tryParseAddress } from "@/shared/solana/address";

export const ownerWalletRoutes = new Hono<{ Bindings: Env }>();

const addr = getAddressDecoder();

function pubkeyBytesEqualBase58(bytes: Uint8Array, base58: string): boolean {
  try {
    return addr.decode(bytes) === base58;
  } catch {
    return false;
  }
}

function requireAppOrigin(c: {
  req: { header: (name: string) => string | undefined };
}): Response | { origin: string } {
  const origin = c.req.header("Origin")?.trim() ?? "";
  if (!origin || !isAppBrowserOrigin(origin)) {
    return json(
      { error: "App origin required", code: "origin_required" },
      { status: 403 },
    );
  }
  return { origin };
}

/** COSE from registration attestation (required on first backup). */
async function resolvePutWebauthnKey(
  record: Record<string, unknown>,
  expectedRpId: string,
): Promise<
  | { ok: true; key: string | null; credentialId: Uint8Array | null }
  | { ok: false; code: string; error: string }
> {
  const attestation =
    typeof record["webauthnAttestationObject"] === "string"
      ? record["webauthnAttestationObject"].trim()
      : "";
  if (!attestation) {
    return { ok: true, key: null, credentialId: null };
  }
  try {
    const cred = await extractCredentialFromAttestationObject(
      attestation,
      expectedRpId,
    );
    return {
      ok: true,
      key: bytesToBase64Url(cred.publicKey),
      credentialId: cred.credentialId,
    };
  } catch {
    return {
      ok: false,
      code: "invalid_webauthn_key",
      error: "Invalid webauthnAttestationObject",
    };
  }
}

function isAuthenticationResponseJSON(
  v: unknown,
): v is AuthenticationResponseJSON {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "string" || typeof r["rawId"] !== "string") {
    return false;
  }
  if (r["type"] !== "public-key") return false;
  const response = r["response"];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    typeof resp["clientDataJSON"] === "string" &&
    typeof resp["authenticatorData"] === "string" &&
    typeof resp["signature"] === "string"
  );
}

ownerWalletRoutes.post("/owner-wallet/blob/backup-challenge", async (c) => {
  const originOrErr = requireAppOrigin(c);
  if (originOrErr instanceof Response) return originOrErr;

  const issued = await issueBackupChallenge();
  return json(issued);
});

/**
 * POST /owner-wallet/blob/restore-challenge — mint a single-use WebAuthn challenge.
 * App-origin only (scrape reduction). Challenge bytes are used as the
 * authenticator challenge on discoverable unlock.
 */
ownerWalletRoutes.post("/owner-wallet/blob/restore-challenge", async (c) => {
  const originOrErr = requireAppOrigin(c);
  if (originOrErr instanceof Response) return originOrErr;

  const issued = await issueRestoreChallenge();
  return json(issued);
});

/**
 * POST /owner-wallet/blob/restore — verify WebAuthn assertion, return ciphertext.
 * Body: `{ challengeId, assertion }`. Signer posts this; ciphertext stays there.
 */
ownerWalletRoutes.post("/owner-wallet/blob/restore", async (c) => {
  const meta = auditMeta(c);
  const originOrErr = requireAppOrigin(c);
  if (originOrErr instanceof Response) {
    recordAudit({
      event: "blob_get",
      ok: false,
      actor: "system",
      code: "origin_required",
      origin: meta.origin,
      requestId: meta.requestId,
    });
    return originOrErr;
  }
  const { origin } = originOrErr;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const challengeId =
    typeof record["challengeId"] === "string"
      ? record["challengeId"].trim()
      : "";
  const assertion = record["assertion"];

  if (!challengeId) {
    return json(
      { error: "challengeId is required", code: "challenge_required" },
      { status: 400 },
    );
  }
  if (!isAuthenticationResponseJSON(assertion)) {
    return json(
      {
        error: "assertion must be a WebAuthn AuthenticationResponseJSON",
        code: "invalid_assertion",
      },
      { status: 400 },
    );
  }

  const expectedChallenge = await consumeRestoreChallenge(challengeId);
  if (!expectedChallenge) {
    recordAudit({
      event: "blob_get",
      ok: false,
      actor: "system",
      code: "challenge_invalid",
      origin: meta.origin,
      requestId: meta.requestId,
    });
    return json(
      {
        error: "Restore challenge expired or invalid. Try again.",
        code: "challenge_invalid",
      },
      { status: 409 },
    );
  }

  let credentialIdHash: string;
  try {
    const rawId = base64UrlToBytes(assertion.rawId, MAX_CREDENTIAL_ID_BYTES);
    credentialIdHash = await sha256Hex(rawId);
  } catch {
    return json(
      { error: "Invalid assertion rawId", code: "invalid_assertion" },
      { status: 400 },
    );
  }

  try {
    const row = await getOwnerWalletBlob(credentialIdHash);
    if (!row) {
      return json(
        { error: "No wallet backup found", code: "not_found" },
        { status: 404 },
      );
    }

    const verified = await verifyOwnerWalletAssertion({
      assertion,
      expectedChallenge,
      origin,
      storedPublicKeyBytes: base64UrlToBytes(row.webauthnPublicKey, 1024),
    });
    if (!verified.ok) {
      recordAudit({
        event: "blob_get",
        ok: false,
        actor: "system",
        code: verified.code,
        origin: meta.origin,
        requestId: meta.requestId,
        detail: { hashPrefix: credentialIdHash.slice(0, 8) },
      });
      return json(
        { error: verified.error, code: verified.code },
        { status: verified.status },
      );
    }

    recordAudit({
      event: "blob_get",
      ok: true,
      actor: "system",
      origin: meta.origin,
      requestId: meta.requestId,
      detail: { hashPrefix: credentialIdHash.slice(0, 8) },
    });
    return json({
      encryptedWalletBlob: row.encryptedBlob,
      publicKey: row.publicKey,
      blobVersion: row.blobVersion,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    return json(
      { error: getErrorMessage(error, "Failed to load wallet backup") },
      { status: 502 },
    );
  }
});

/**
 * PUT — `{ challengeId, signature, encryptedWalletBlob, publicKey }`.
 * Create requires `webauthnAttestationObject` (credential ID bound to blob).
 * Update refreshes ciphertext + mints owner_session.
 */
ownerWalletRoutes.put("/owner-wallet/blob", async (c) => {
  const originOrErr = requireAppOrigin(c);
  if (originOrErr instanceof Response) return originOrErr;
  const { origin } = originOrErr;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return json(
      { error: "App origin required", code: "origin_required" },
      { status: 403 },
    );
  }
  const expectedRpId = resolveWebAuthnRpId(hostname);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const encryptedWalletBlob = record["encryptedWalletBlob"];
  const publicKeyRaw = record["publicKey"];
  const challengeId =
    typeof record["challengeId"] === "string"
      ? record["challengeId"].trim()
      : "";
  const signatureB64 =
    typeof record["signature"] === "string" ? record["signature"].trim() : "";

  if (!challengeId || !signatureB64) {
    return json(
      {
        error: "challengeId and signature are required",
        code: "proof_required",
      },
      { status: 401 },
    );
  }
  if (typeof encryptedWalletBlob !== "string" || !encryptedWalletBlob) {
    return json(
      { error: "encryptedWalletBlob is required", code: "invalid_wallet_blob" },
      { status: 400 },
    );
  }
  if (typeof publicKeyRaw !== "string" || !tryParseAddress(publicKeyRaw)) {
    return json(
      {
        error: "publicKey must be a valid Solana address",
        code: "invalid_public_key",
      },
      { status: 400 },
    );
  }
  const publicKey = publicKeyRaw.trim();

  const attestation = await resolvePutWebauthnKey(record, expectedRpId);
  if (!attestation.ok) {
    return json(
      { error: attestation.error, code: attestation.code },
      { status: 400 },
    );
  }

  let header;
  try {
    const raw = base64UrlToBytes(encryptedWalletBlob, MAX_OWNER_BLOB_BYTES);
    header = parseOwnerBlobHeader(raw);
  } catch (e) {
    const code =
      e instanceof OwnerBlobParseError
        ? "invalid_wallet_blob"
        : "invalid_proof";
    return json(
      { error: "Invalid encrypted wallet blob or proof", code },
      { status: 400 },
    );
  }

  if (!pubkeyBytesEqualBase58(header.publicKey, publicKey)) {
    return json(
      {
        error: "publicKey does not match the wallet blob",
        code: "wallet_mismatch",
      },
      { status: 400 },
    );
  }

  if (
    attestation.credentialId &&
    !timingSafeEqual(attestation.credentialId, header.credentialId)
  ) {
    return json(
      {
        error: "WebAuthn credential does not match the wallet blob",
        code: "webauthn_credential_mismatch",
      },
      { status: 400 },
    );
  }

  const proof = await verifyConsumedChallengeProof({
    challengeId,
    signatureB64,
    publicKeyBytes: header.publicKey,
    consume: consumeBackupChallenge,
    buildMessage: backupChallengeMessage,
    expiredError: "This backup request expired. Try again.",
  });
  if (!proof.ok) {
    return json(
      { error: proof.error, code: proof.code },
      { status: proof.status },
    );
  }

  try {
    const credentialIdHash = await sha256Hex(header.credentialId);
    const result = await putOwnerWalletBlob({
      credentialIdHash,
      publicKey,
      encryptedBlob: bytesToBase64Url(header.raw),
      blobVersion: header.version,
      webauthnPublicKey: attestation.key,
    });
    if (result === "conflict") {
      return json(
        {
          error: "A different wallet is already stored for this passkey",
          code: "wallet_conflict",
        },
        { status: 409 },
      );
    }
    if (result === "webauthn_required") {
      return json(
        {
          error: "webauthnAttestationObject is required on first backup",
          code: "webauthn_required",
        },
        { status: 400 },
      );
    }
    const { expiresAt } = await issueOwnerSessionCookie(c, publicKey);
    return json({
      ok: true,
      credentialIdHash,
      created: result === "created",
      expiresAt,
    });
  } catch (error) {
    return json(
      { error: getErrorMessage(error, "Failed to store wallet backup") },
      { status: 502 },
    );
  }
});
