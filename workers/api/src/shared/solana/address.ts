import { address, type Address } from "@solana/kit";

/** Parse a base58 Solana address; returns null if empty or invalid. */
export function tryParseAddress(
  value: string | null | undefined
): Address | null {
  if (!value?.trim()) return null;
  try {
    return address(value.trim());
  } catch {
    return null;
  }
}
