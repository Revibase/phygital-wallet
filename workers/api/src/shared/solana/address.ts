import { address, type Address } from "@solana/kit";

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
