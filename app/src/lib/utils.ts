import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Truncate an address to `head…tail` for compact, verifiable display. */
export function shortAddress(value: string, length = 4): string {
  if (value.length <= length * 2 + 1) return value;
  return `${value.slice(0, length)}…${value.slice(-length)}`;
}
