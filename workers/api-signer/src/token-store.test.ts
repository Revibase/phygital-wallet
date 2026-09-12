import { describe, expect, it } from "vitest";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import {
  resolveWebAuthnRp,
  hashMutationBinding,
  buildMutationOptions,
} from "@/webauthn-mutation";
import { initTokenSchema, TokenStore } from "@/token-store";

/** Minimal in-memory stand-in for DO SqlStorage.exec. */
function memorySql() {
  const tables = new Map<string, Record<string, unknown>[]>();

  const exec = (query: string, ...params: unknown[]) => {
    const q = query.replace(/\s+/g, " ").trim();

    if (q.startsWith("CREATE TABLE") || q.startsWith("CREATE INDEX")) {
      return { toArray: () => [] };
    }

    if (q.startsWith("DROP TABLE")) {
      if (q.includes("challenges")) tables.delete("challenges");
      return { toArray: () => [] };
    }

    if (q.includes("PRAGMA table_info(challenges)")) {
      const rows = tables.get("challenges");
      if (!rows) return { toArray: () => [] };
      return {
        toArray: () => [
          { name: "id" },
          { name: "nonce" },
          { name: "binding_hash" },
          { name: "origin" },
          { name: "expires_at" },
        ],
      };
    }

    if (q.includes("INSERT INTO meta")) {
      const rows = tables.get("meta") ?? [];
      rows.push({ key: params[0], value: params[1] });
      tables.set("meta", rows);
      return { toArray: () => [] };
    }

    if (q.includes("SELECT value FROM meta")) {
      const rows = tables.get("meta") ?? [];
      const hit = rows.find((r) => r.key === "phygital_token");
      return { toArray: () => (hit ? [{ value: hit.value }] : []) };
    }

    if (q.includes("INSERT INTO owner")) {
      tables.set("owner", [
        {
          id: 1,
          credential_id: params[0],
          public_key: params[1],
          linked_at: params[2],
          label: params[3],
          image_url: params[4],
          mint: params[5],
        },
      ]);
      return { toArray: () => [] };
    }

    if (q.includes("FROM owner WHERE id = 1")) {
      const rows = tables.get("owner") ?? [];
      return { toArray: () => (rows[0] ? [rows[0]] : []) };
    }

    if (q.includes("INSERT INTO grants")) {
      const rows = tables.get("grants") ?? [];
      rows.push({
        id: params[0],
        intent_hash: params[1],
        expires_at: params[2],
        consumed_at: null,
        created_at: params[3],
      });
      tables.set("grants", rows);
      return { toArray: () => [] };
    }

    if (q.includes("FROM grants") && q.includes("consumed_at IS NULL")) {
      const rows = tables.get("grants") ?? [];
      const now = params[1] as number;
      const hit = rows.find(
        (r) =>
          r.intent_hash === params[0] &&
          r.consumed_at == null &&
          (r.expires_at as number) > now,
      );
      return { toArray: () => (hit ? [{ id: hit.id }] : []) };
    }

    if (q.includes("UPDATE grants SET consumed_at")) {
      const rows = tables.get("grants") ?? [];
      const row = rows.find((r) => r.id === params[1] && r.consumed_at == null);
      if (row) row.consumed_at = params[0];
      return { toArray: () => [] };
    }

    if (q.includes("INSERT INTO fee_events")) {
      const rows = tables.get("fee_events") ?? [];
      if (rows.some((r) => r.signature === params[0])) {
        throw new Error("duplicate");
      }
      rows.push({
        signature: params[0],
        kind: params[1],
        lamports: params[2],
        created_at: params[3],
      });
      tables.set("fee_events", rows);
      return { toArray: () => [] };
    }

    if (q.includes("FROM fee_events WHERE signature")) {
      const rows = tables.get("fee_events") ?? [];
      const hit = rows.find((r) => r.signature === params[0]);
      return { toArray: () => (hit ? [{ signature: hit.signature }] : []) };
    }

    if (q.includes("FROM fee_balance")) {
      const rows = tables.get("fee_balance") ?? [];
      const hit = rows[0];
      return {
        toArray: () =>
          hit ? [{ balance_lamports: hit.balance_lamports }] : [],
      };
    }

    if (q.includes("INSERT INTO fee_balance")) {
      tables.set("fee_balance", [
        {
          id: 1,
          balance_lamports: params[0],
          updated_at: params[1],
        },
      ]);
      return { toArray: () => [] };
    }

    if (q.includes("DELETE FROM owner")) {
      tables.set("owner", []);
      return { toArray: () => [] };
    }

    if (q.includes("DELETE FROM grants")) {
      tables.set("grants", []);
      return { toArray: () => [] };
    }

    if (q.includes("DELETE FROM policy")) {
      tables.set("policy", []);
      return { toArray: () => [] };
    }

    if (q.includes("INSERT INTO policy")) {
      tables.set("policy", [
        { id: 1, policy_json: params[0], updated_at: params[1] },
      ]);
      return { toArray: () => [] };
    }

    if (q.includes("FROM policy WHERE id = 1")) {
      const rows = tables.get("policy") ?? [];
      return { toArray: () => (rows[0] ? [rows[0]] : []) };
    }

    if (q.includes("INSERT INTO challenges")) {
      const rows = tables.get("challenges") ?? [];
      rows.push({
        id: params[0],
        nonce: params[1],
        binding_hash: params[2],
        origin: params[3],
        expires_at: params[4],
      });
      tables.set("challenges", rows);
      return { toArray: () => [] };
    }

    if (q.includes("FROM challenges") && q.includes("WHERE id")) {
      const rows = tables.get("challenges") ?? [];
      const hit = rows.find((r) => r.id === params[0]);
      return { toArray: () => (hit ? [hit] : []) };
    }

    if (q.includes("DELETE FROM challenges")) {
      if (q.includes("WHERE id")) {
        const rows = tables.get("challenges") ?? [];
        tables.set(
          "challenges",
          rows.filter((r) => r.id !== params[0]),
        );
        return { toArray: () => [] };
      }
      if (q.includes("expires_at")) {
        const rows = tables.get("challenges") ?? [];
        const now = params[0] as number;
        tables.set(
          "challenges",
          rows.filter((r) => (r.expires_at as number) >= now),
        );
        return { toArray: () => [] };
      }
      tables.set("challenges", []);
      return { toArray: () => [] };
    }

    return { toArray: () => [] };
  };

  return {
    exec: exec as DurableObjectStorage["sql"]["exec"],
  } as DurableObjectStorage["sql"];
}

describe("resolveWebAuthnRp", () => {
  it("accepts revibase origins", () => {
    const rp = resolveWebAuthnRp("https://app.revibase.com");
    expect(rp?.rpId).toBe("revibase.com");
  });

  it("rejects unknown origins", () => {
    expect(resolveWebAuthnRp("https://evil.example")).toBeNull();
  });
});

describe("hashMutationBinding", () => {
  it("is stable for the same policy regardless of key order", async () => {
    const a = await hashMutationBinding({
      kind: "setPolicy",
      policy: {
        version: "3",
        mintLimits: [{ mint: "M", maxRaw: "1" }],
      } as never,
    });
    const b = await hashMutationBinding({
      kind: "setPolicy",
      policy: {
        mintLimits: [{ maxRaw: "1", mint: "M" }],
        version: "3",
      } as never,
    });
    expect(a).toBe(b);
  });

  it("differs across write kinds", async () => {
    const clear = await hashMutationBinding({ kind: "clearPolicy" });
    const unlink = await hashMutationBinding({ kind: "removeOwner" });
    const grant = await hashMutationBinding({
      kind: "createGrant",
      intentHash: "abc",
    });
    const claim = await hashMutationBinding({
      kind: "addOwner",
      credentialId: "cred-a",
    });
    expect(new Set([clear, unlink, grant, claim]).size).toBe(4);
  });
});

describe("WebAuthn challenge encoding", () => {
  // Regression: passing a base64url string into generateAuthenticationOptions
  // UTF-8-encodes it again, so verify sees a different challenge than mint.
  const storedChallenge = "kWFILFRO7VkgP4I1vzN2SG1gPyKFwEZ93DXKdNVy27M";

  it("double-encodes when a base64url challenge is passed as a string", async () => {
    const options = await generateAuthenticationOptions({
      rpID: "localhost",
      challenge: storedChallenge,
    });
    expect(options.challenge).not.toBe(storedChallenge);
    expect(
      new TextDecoder().decode(isoBase64URL.toBuffer(options.challenge)),
    ).toBe(storedChallenge);
  });

  it("preserves the challenge when passed as bytes", async () => {
    const options = await generateAuthenticationOptions({
      rpID: "localhost",
      challenge: isoBase64URL.toBuffer(storedChallenge),
    });
    expect(options.challenge).toBe(storedChallenge);
  });

  it("buildMutationOptions emits options.challenge matching the DO store", async () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");

    const credentialId = "dGVzdC1jcmVkLWlk"; // valid base64url
    const result = await buildMutationOptions(store, "http://localhost:3000", {
      kind: "addOwner",
      credentialId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const consumed = await store.consumeChallenge(
      result.challengeId,
      "http://localhost:3000",
      await hashMutationBinding({ kind: "addOwner", credentialId }),
    );
    expect(consumed).not.toBeNull();
    expect(result.options.challenge).toBe(consumed!.challenge);
  });
});

describe("TokenStore grants and fees", () => {
  it("consumes a grant once", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");
    store.createGrant("intent-a", 300);
    expect(store.findValidGrant("intent-a")).not.toBeNull();
    expect(store.tryConsumeGrant("intent-a")).toBe(true);
    expect(store.tryConsumeGrant("intent-a")).toBe(false);
  });

  it("applies fee events idempotently", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");
    expect(store.getFeeBalanceLamports()).toBe(1_000_000);
    expect(
      store.applyFeeEvent({
        signature: "sig:credit",
        kind: "credit",
        lamports: 1000,
      }),
    ).toBe(true);
    expect(
      store.applyFeeEvent({
        signature: "sig:credit",
        kind: "credit",
        lamports: 1000,
      }),
    ).toBe(false);
    expect(store.getFeeBalanceLamports()).toBe(1_001_000);
  });

  it("seeds starter fee balance once on ensureToken", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    expect(store.getFeeBalanceLamports()).toBe(0);
    store.ensureToken("Token111");
    expect(store.getFeeBalanceLamports()).toBe(1_000_000);
    store.ensureToken("Token111");
    expect(store.getFeeBalanceLamports()).toBe(1_000_000);
  });

  it("rejects second owner credential", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");
    expect(
      store.addOwner({
        credentialId: "cred-a",
        publicKey: "pk",
      }).ok,
    ).toBe(true);
    expect(
      store.addOwner({
        credentialId: "cred-b",
        publicKey: "pk2",
      }),
    ).toEqual({ ok: false, code: "linked_elsewhere" });
  });

  it("clearOwnerAndPolicies wipes owner and grants so a new owner can claim", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");
    store.addOwner({
      credentialId: "cred-a",
      publicKey: "pk",
    });
    store.createGrant("intent-a", 300);
    store.clearOwnerAndPolicies();
    expect(store.hasOwner()).toBe(false);
    expect(store.findValidGrant("intent-a")).toBeNull();
    expect(
      store.addOwner({
        credentialId: "cred-b",
        publicKey: "pk2",
      }).ok,
    ).toBe(true);
  });

  it("upsertPolicy returns Result and caches parsed policy", () => {
    const sql = memorySql();
    initTokenSchema(sql);
    const store = new TokenStore(sql, "Token111");
    store.ensureToken("Token111");
    expect(store.upsertPolicy({ notPrograms: true })).toEqual({
      ok: false,
      code: "invalid_policy",
      error: "Unsupported policy version: undefined",
    });
    const ok = store.upsertPolicy({
      version: "3",
      mintLimits: [
        {
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          maxRaw: "50000000",
        },
      ],
    });
    expect(ok.ok).toBe(true);
    expect(store.loadPolicyDocument()).not.toBeNull();
    expect(store.loadPolicyDocument()).not.toBe("invalid");
    store.clearPolicyAndGrants();
    expect(store.loadPolicyDocument()).toBeNull();
  });
});
