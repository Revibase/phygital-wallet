import type { Instruction } from "@solana/kit";

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable hash of phygitalToken + canonical instruction list. */
export async function hashIntent(
  phygitalToken: string,
  instructions: readonly Instruction[],
): Promise<string> {
  const parts: string[] = [phygitalToken];
  for (const ix of instructions) {
    parts.push(ix.programAddress);
    // Compact execute ixs have no roles — hash addresses only so preview ≡ /sign.
    for (const a of ix.accounts ?? []) {
      parts.push(a.address);
    }
    parts.push(bytesToHex(ix.data ? new Uint8Array(ix.data) : new Uint8Array()));
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("|")),
  );
  return bytesToHex(new Uint8Array(digest));
}
