import { describe, expect, it } from "vitest";
import { validateInbound } from "./protocol.js";

const rid = "abcd1234efgh";
const base = { protocolVersion: 1, requestId: rid };

describe("validateInbound", () => {
  it("accepts AUTH_START", () => {
    const r = validateInbound({ ...base, type: "AUTH_START" });
    expect(r.ok).toBe(true);
  });

  it("accepts SIGN_TRANSACTION with tx only (local blob)", () => {
    const r = validateInbound({
      ...base,
      type: "SIGN_TRANSACTION",
      transaction: "AQID",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects SIGN_TRANSACTION with parent blob (strict schema)", () => {
    const r = validateInbound({
      ...base,
      type: "SIGN_TRANSACTION",
      encryptedWalletBlob: "AAAA",
      transaction: "AQID",
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("rejects AUTH_START with parent blob (strict schema)", () => {
    const r = validateInbound({
      ...base,
      type: "AUTH_START",
      encryptedWalletBlob: "AAAA",
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("rejects wrong protocol version", () => {
    const r = validateInbound({ ...base, protocolVersion: 2, type: "AUTH_START" });
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects unknown operation", () => {
    const r = validateInbound({ ...base, type: "IMPORT_KEY" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("rejects unknown extra fields (strict schema)", () => {
    const r = validateInbound({ ...base, type: "AUTH_START", evil: 1 });
    expect(r).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("rejects a bad requestId", () => {
    const r = validateInbound({
      protocolVersion: 1,
      requestId: "short",
      type: "AUTH_START",
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("rejects non-object payloads", () => {
    expect(validateInbound(null)).toMatchObject({ ok: false });
    expect(validateInbound("x")).toMatchObject({ ok: false });
    expect(validateInbound([1, 2, 3])).toMatchObject({ ok: false });
  });

  it("rejects an oversized message", () => {
    const r = validateInbound({
      ...base,
      type: "SIGN_TRANSACTION",
      transaction: "A".repeat(50_000),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an oversized transaction string", () => {
    const tx = "A".repeat(4096 * 2);
    const r = validateInbound({
      ...base,
      type: "SIGN_TRANSACTION",
      transaction: tx,
    });
    expect(r).toMatchObject({ ok: false });
  });

  it("accepts AUTH_START create with credentialId", () => {
    expect(
      validateInbound({
        ...base,
        type: "AUTH_START",
        authMode: "create",
        credentialId: "AAAA",
      }).ok,
    ).toBe(true);
  });

  it("accepts BLOB_PROVIDED with blob or errorCode", () => {
    expect(
      validateInbound({
        ...base,
        type: "BLOB_PROVIDED",
        encryptedWalletBlob: "AAAA",
      }).ok,
    ).toBe(true);
    expect(
      validateInbound({
        ...base,
        type: "BLOB_PROVIDED",
        errorCode: "BLOB_UNAVAILABLE",
      }).ok,
    ).toBe(true);
  });

  it("accepts EXPORT_PRIVATE_KEY", () => {
    expect(validateInbound({ ...base, type: "EXPORT_PRIVATE_KEY" }).ok).toBe(
      true,
    );
  });
});
