import { describe, expect, it } from "vitest";

import {
  canAccessTokenWallet,
  verifyBrowseUnlockCookie,
  verifyDeviceRefreshCookie,
  verifyDeviceSessionCookie,
} from "./session-cookies";

const SECRET = "test-session-secret";

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  const payloadB64 = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  let macBinary = "";
  for (const b of mac) macBinary += String.fromCharCode(b);
  const macB64 = btoa(macBinary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payloadB64}.${macB64}`;
}

describe("session-cookies", () => {
  it("verifies device session", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`cred1|${exp}|jti-1`);
    const session = await verifyDeviceSessionCookie(token, SECRET);
    expect(session).toEqual({
      credentialId: "cred1",
      exp,
      jti: "jti-1",
    });
  });

  it("verifies device refresh", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`dref|cred1|${exp}|jti-r`);
    const session = await verifyDeviceRefreshCookie(token, SECRET);
    expect(session).toEqual({
      credentialId: "cred1",
      exp,
      jti: "jti-r",
    });
    expect(await verifyDeviceSessionCookie(token, SECRET)).toBeNull();
  });

  it("rejects expired browse unlock", async () => {
    const exp = Date.now() - 1_000;
    const token = await sign(`TokenPda111|${exp}|jti-2`);
    expect(await verifyBrowseUnlockCookie(token, SECRET)).toBeNull();
  });

  it("allows wallet when browse unlock matches", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`TokenPda111|${exp}|jti-3`);
    await expect(
      canAccessTokenWallet({
        phygitalToken: "TokenPda111",
        browseUnlockCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });

  it("allows wallet when device session is valid", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`cred1|${exp}|jti-4`);
    await expect(
      canAccessTokenWallet({
        phygitalToken: "TokenPda111",
        deviceSessionCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });

  it("allows wallet when only refresh is valid", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`dref|cred1|${exp}|jti-6`);
    await expect(
      canAccessTokenWallet({
        phygitalToken: "TokenPda111",
        deviceRefreshCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });

  it("denies when browse unlock is for another token", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`OtherToken|${exp}|jti-5`);
    await expect(
      canAccessTokenWallet({
        phygitalToken: "TokenPda111",
        browseUnlockCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });
});
