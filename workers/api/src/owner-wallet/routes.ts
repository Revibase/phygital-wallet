/**
 * Owner wallet encrypted-blob backup (D1).
 *
 * GET — public by credentialIdHash (ciphertext only; optional privacy gate later).
 * PUT — requires ed25519 signature over a server challenge, produced inside the
 *       secure-signer after passkey unlock (proves possession of the wallet).
 *       On success also mints the owner_session cookie (same proof = signed in).
 */
import { Hono } from "hono";
import { getAddressDecoder } from "@solana/kit";

import {
  issueOwnerSessionCookie,
} from "@/auth/owner-session";
import { verifyConsumedChallengeProof } from "@/auth/possession-proof";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  isCredentialIdHash,
  MAX_OWNER_BLOB_BYTES,
  OwnerBlobParseError,
  parseOwnerBlobHeader,
  sha256Hex,
} from "@/owner-wallet/blob-format";
import {
  consumePutChallenge,
  issuePutChallenge,
  putChallengeMessage,
} from "@/owner-wallet/challenge";
import {
  getOwnerWalletBlob,
  putOwnerWalletBlob,
} from "@/owner-wallet/blob-store";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
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

/** POST /owner-wallet/blob/challenge — mint a single-use PUT challenge. */
ownerWalletRoutes.post("/owner-wallet/blob/challenge", async (c) => {
  const issued = await issuePutChallenge();
  return json(issued);
});

/** GET — hash-only lookup (no auth). Bootstrap for new-device restore. */
ownerWalletRoutes.get("/owner-wallet/blob", async (c) => {
  const hash = c.req.query("credentialIdHash")?.trim().toLowerCase() ?? "";
  if (!isCredentialIdHash(hash)) {
    return json(
      {
        error: "Query param credentialIdHash must be a 64-char hex sha256",
        code: "invalid_credential_id_hash",
      },
      { status: 400 },
    );
  }

  try {
    const row = await getOwnerWalletBlob(hash);
    if (!row) {
      return json(
        { error: "No wallet backup found", code: "not_found" },
        { status: 404 },
      );
    }
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
 * PUT — requires `{ challengeId, signature, encryptedWalletBlob, publicKey }`.
 * Signature is ed25519 over `revibase.owner-wallet.put.v1 || challengeBytes`.
 */
ownerWalletRoutes.put("/owner-wallet/blob", async (c) => {
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
    typeof record["challengeId"] === "string" ? record["challengeId"].trim() : "";
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

  const proof = await verifyConsumedChallengeProof({
    challengeId,
    signatureB64,
    publicKeyBytes: header.publicKey,
    consume: consumePutChallenge,
    buildMessage: putChallengeMessage,
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
    const normalizedBlob = bytesToBase64Url(header.raw);
    const result = await putOwnerWalletBlob({
      credentialIdHash,
      publicKey,
      encryptedBlob: normalizedBlob,
      blobVersion: header.version,
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
    // Same possession proof that authorized the backup also signs this browser in.
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
