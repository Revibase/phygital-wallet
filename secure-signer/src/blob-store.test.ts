import { describe, expect, it } from "vitest";
import {
  LOCAL_BLOB_KEY,
  readLocalBlob,
  writeLocalBlob,
  type ByteStore,
} from "./blob-store.js";
import { createWallet, type PrfProvider, type PrfResult } from "./wallet-service.js";
import { sha256 } from "./crypto.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

class MockPrf implements PrfProvider {
  constructor(private readonly secret: string) {}
  async create(_rpId: string, _opts: { userName: string }): Promise<PrfResult> {
    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    return { credentialId, prfOutput: await this.derive(credentialId) };
  }
  async get(
    _rpId: string,
    credentialId: Uint8Array,
  ): Promise<{ prfOutput: Uint8Array }> {
    return { prfOutput: await this.derive(credentialId) };
  }
  private derive(credentialId: Uint8Array): Promise<Uint8Array> {
    return sha256(new Uint8Array([...credentialId, ...utf8(this.secret)]));
  }
}

function memoryStore(): ByteStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("blob-store", () => {
  it("persists and reads a valid wallet blob", async () => {
    const { blob } = await createWallet(new MockPrf("a"), "signer.example.com", {
      userName: "alice",
    });
    const store = memoryStore();
    expect(writeLocalBlob(blob, store)).toBe(true);
    expect(store.data.has(LOCAL_BLOB_KEY)).toBe(true);
    const read = readLocalBlob(store);
    expect(read).not.toBeNull();
    expect([...read!.raw]).toEqual([...blob]);
  });

  it("fails when setItem does not round-trip", async () => {
    const { blob } = await createWallet(new MockPrf("a"), "signer.example.com", {
      userName: "alice",
    });
    const store: ByteStore = {
      getItem() {
        return null;
      },
      setItem() {
        /* pretend write succeeded */
      },
      removeItem() {},
    };
    expect(writeLocalBlob(blob, store)).toBe(false);
  });

  it("fails when store is unavailable", async () => {
    const { blob } = await createWallet(new MockPrf("a"), "signer.example.com", {
      userName: "alice",
    });
    expect(writeLocalBlob(blob, null)).toBe(false);
  });
});
