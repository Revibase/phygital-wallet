import { describe, expect, it } from "vitest";

import {
  canAccessPhygitalToken,
  verifyBrowseUnlockCookie,
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
  it("rejects expired browse unlock", async () => {
    const exp = Date.now() - 1_000;
    const token = await sign(`TokenPda111|${exp}|jti-2`);
    expect(await verifyBrowseUnlockCookie(token, SECRET)).toBeNull();
  });

  it("allows access when browse unlock matches", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`TokenPda111|${exp}|jti-3`);
    await expect(
      canAccessPhygitalToken({
        phygitalToken: "TokenPda111",
        browseUnlockCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });

  it("denies access when browse unlock is for another token", async () => {
    const exp = Date.now() + 60_000;
    const token = await sign(`TokenPdaOther|${exp}|jti-4`);
    await expect(
      canAccessPhygitalToken({
        phygitalToken: "TokenPda111",
        browseUnlockCookie: token,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });

  it("denies access with no cookie", async () => {
    await expect(
      canAccessPhygitalToken({
        phygitalToken: "TokenPda111",
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });
});
