/**
 * Platform WebAuthn for TokenSigner mutations: short-TTL challenge + signature.
 *
 * Signing material = SHA-256(nonce ‖ bindingHash), where bindingHash covers the
 * exact write being approved (policy body, grant intent, clear, unlink, …).
 * Challenge store is id → { nonce, bindingHash }; client sends challengeId + assertion.
 * No authenticator counter tracking — challenge consume is the replay defense.
 */
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { PaymentsPolicyConfig } from "phygital-policy";

import type { TokenStore } from "@/token-store";

/** Intent bound into the WebAuthn challenge for every gated write. */
export type MutationBinding =
  | { kind: "addOwner"; credentialId: string }
  | { kind: "setPolicy"; policy: PaymentsPolicyConfig }
  | { kind: "clearPolicy" }
  | { kind: "createGrant"; intentHash: string }
  | { kind: "removeOwner" };

export function resolveWebAuthnRp(originHeader: string | null): {
  rpId: string;
  rpName: string;
  expectedOrigin: string;
} | null {
  // Keep in sync with workers/api/src/auth/webauthn-challenge.ts (same RP rules).
  if (!originHeader) return null;
  try {
    const url = new URL(originHeader);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return {
        rpId: host,
        rpName: "Revibase",
        expectedOrigin: originHeader,
      };
    }
    if (host === "revibase.com" || host.endsWith(".revibase.com")) {
      return {
        rpId: "revibase.com",
        rpName: "Revibase",
        expectedOrigin: originHeader,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Stable JSON so the same logical binding always hashes the same. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function normalizeBindingHashInput(binding: MutationBinding): MutationBinding {
  if (binding.kind === "createGrant") {
    return { kind: "createGrant", intentHash: binding.intentHash.trim() };
  }
  if (binding.kind === "addOwner") {
    return { kind: "addOwner", credentialId: binding.credentialId.trim() };
  }
  return binding;
}

export async function hashMutationBinding(
  binding: MutationBinding
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalJson(normalizeBindingHashInput(binding))
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return isoBase64URL.fromBuffer(new Uint8Array(digest));
}

type PublicKeyCredentialRequestOptionsJSON = Awaited<
  ReturnType<typeof generateAuthenticationOptions>
>;

export async function buildMutationOptions(
  store: TokenStore,
  origin: string,
  binding: MutationBinding
): Promise<
  | {
      ok: true;
      challengeId: string;
      options: PublicKeyCredentialRequestOptionsJSON;
    }
  | { ok: false; code: string; error: string }
> {
  const rp = resolveWebAuthnRp(origin);
  if (!rp) {
    return {
      ok: false,
      code: "invalid_transaction",
      error: "Unsupported origin",
    };
  }

  let allowCredentialId: string;
  if (binding.kind === "addOwner") {
    const credentialId = binding.credentialId.trim();
    if (!credentialId) {
      return {
        ok: false,
        code: "invalid_transaction",
        error: "credentialId required",
      };
    }
    const current = store.getCurrentOwner();
    if (current && current.credentialId !== credentialId) {
      return {
        ok: false,
        code: "linked_elsewhere",
        error: "This accessory is linked to another phone.",
      };
    }
    allowCredentialId = credentialId;
  } else {
    const owner = store.getCurrentOwner();
    if (!owner) {
      return {
        ok: false,
        code: "not_owner",
        error: "No owner linked for this token",
      };
    }
    allowCredentialId = owner.credentialId;
  }

  const bindingHash = await hashMutationBinding(binding);
  const { id: challengeId, challenge } = await store.createChallenge(
    rp.expectedOrigin,
    bindingHash
  );
  // Pass raw challenge bytes. A string is UTF-8-encoded then base64url'd again
  // by @simplewebauthn/server, which breaks verifyAuthenticationResponse.
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: "required",
    challenge: isoBase64URL.toBuffer(challenge),
    allowCredentials: [
      {
        id: allowCredentialId,
        transports: ["internal" as const],
      },
    ],
  });
  if (options.challenge !== challenge) {
    return {
      ok: false,
      code: "signer_misconfigured",
      error: "WebAuthn challenge encoding mismatch",
    };
  }

  return { ok: true, challengeId, options };
}

/**
 * 1) Consume short-TTL challenge by id; binding must match mint
 * 2) Verify assertion against derived challenge + credential public key
 *
 * Owner mutations use the stored owner key. `addOwner` uses `claimantPublicKey`
 * (claimant is not yet stored as owner).
 */
export async function verifyMutationAssertion(args: {
  store: TokenStore;
  challengeId: string;
  binding: MutationBinding;
  assertion: AuthenticationResponseJSON;
  origin: string;
  /** Required when binding.kind === "addOwner". */
  claimantPublicKey?: string;
}): Promise<
  | { ok: true; credentialId: string }
  | { ok: false; code: string; error: string }
> {
  const rp = resolveWebAuthnRp(args.origin);
  if (!rp) {
    return {
      ok: false,
      code: "invalid_transaction",
      error: "Unsupported origin",
    };
  }

  const challengeId = args.challengeId?.trim();
  if (!challengeId) {
    return {
      ok: false,
      code: "challenge_invalid",
      error: "Mutation challenge expired or invalid",
    };
  }

  const bindingHash = await hashMutationBinding(args.binding);
  const consumed = await args.store.consumeChallenge(
    challengeId,
    rp.expectedOrigin,
    bindingHash
  );
  if (!consumed) {
    return {
      ok: false,
      code: "challenge_invalid",
      error: "Mutation challenge expired or invalid",
    };
  }

  let credentialId: string;
  let publicKey: string;
  if (args.binding.kind === "addOwner") {
    const expectedId = args.binding.credentialId.trim();
    if (!expectedId || args.assertion.id !== expectedId) {
      return {
        ok: false,
        code: "device_invalid",
        error: "Couldn’t verify this phone",
      };
    }
    const claimantKey = args.claimantPublicKey?.trim();
    if (!claimantKey) {
      return {
        ok: false,
        code: "invalid_transaction",
        error: "claimant public key required",
      };
    }
    credentialId = expectedId;
    publicKey = claimantKey;
  } else {
    const owner = args.store.getOwner(args.assertion.id);
    if (!owner) {
      return {
        ok: false,
        code: "not_owner",
        error: "Only the owner phone can do this.",
      };
    }
    credentialId = owner.credentialId;
    publicKey = owner.publicKey;
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: args.assertion,
      expectedChallenge: consumed.challenge,
      expectedOrigin: rp.expectedOrigin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: credentialId,
        publicKey: isoBase64URL.toBuffer(publicKey),
        counter: 0,
        transports: ["internal"],
      },
    });

    if (!verification.verified) {
      return {
        ok: false,
        code: "device_invalid",
        error: "Couldn’t verify this phone",
      };
    }

    return { ok: true, credentialId };
  } catch (err) {
    return {
      ok: false,
      code: "device_invalid",
      error: err instanceof Error ? err.message : "Couldn’t verify this phone",
    };
  }
}
