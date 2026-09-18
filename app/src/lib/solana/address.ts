import { address, type Address } from "@solana/kit";

/** First string value of a Next.js dynamic route param. */
export function routeParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return "";
}

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

export function tryParseRouteAddress(
  params: Record<string, string | string[] | undefined>,
  key: string,
): Address | null {
  return tryParseAddress(routeParam(params, key));
}
