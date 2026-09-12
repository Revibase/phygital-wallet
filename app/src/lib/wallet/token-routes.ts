import { tryParseAddress } from "@/lib/solana/address";
import type { SettingsTarget } from "@/components/wallet/settings-hub";

/** Settings targets that only owners may open (policy / signing / recovery). */
export const OWNER_ONLY_SETTINGS = new Set<SettingsTarget>([
  "sendProtections",
  "spendingLimits",
  "extraPrograms",
  "allowedOrigins",
  "signing",
  "recoveryWallet",
]);

const SETTINGS_TO_SEGMENT: Record<SettingsTarget, string> = {
  sendProtections: "send-protections",
  spendingLimits: "spending-limits",
  extraPrograms: "exceptions",
  allowedOrigins: "allowed-sites",
  signing: "signing",
  recoveryWallet: "recovery",
  rpcConnection: "rpc",
  feeBalance: "fee-balance",
  access: "access",
};

const SEGMENT_TO_SETTINGS = new Map<string, SettingsTarget>(
  Object.entries(SETTINGS_TO_SEGMENT).map(([k, v]) => [v, k as SettingsTarget])
);

/** Single-segment wallet leaves (not receive/collectibles/settings trees). */
const WALLET_LEAF_SEGMENTS = new Set(["send", "tokens", "activity"]);

export type PolicySetupScreen = "spendingLimits" | "extraPrograms";

const POLICY_SETUP_SCREENS = new Set<string>([
  "spendingLimits",
  "extraPrograms",
]);

export function isPolicySetupScreen(
  value: string | null | undefined
): value is PolicySetupScreen {
  return Boolean(value && POLICY_SETUP_SCREENS.has(value));
}

export function settingsSegment(target: SettingsTarget): string {
  return SETTINGS_TO_SEGMENT[target];
}

export function settingsFromSegment(
  segment: string | null | undefined
): SettingsTarget | null {
  if (!segment) return null;
  return SEGMENT_TO_SETTINGS.get(segment) ?? null;
}

export function isOwnerOnlySettings(target: SettingsTarget): boolean {
  return OWNER_ONLY_SETTINGS.has(target);
}

/** Card / token home: `/token/{address}`. */
export function tokenHref(phygitalToken: string): string {
  return `/token/${encodeURIComponent(phygitalToken)}`;
}

/**
 * Wallet routes: `/token/{address}/wallet` or deeper segments.
 * Examples: `walletHref(addr)`, `walletHref(addr, "activity")`,
 * `walletHref(addr, "settings", "fee-balance")`,
 * `walletHref(addr, "receive", "nearby")`.
 */
export function walletHref(
  phygitalToken: string,
  ...segments: string[]
): string {
  const base = `${tokenHref(phygitalToken)}/wallet`;
  if (segments.length === 0) return base;
  return `${base}/${segments.map(encodeURIComponent).join("/")}`;
}

export function walletSettingsHref(
  phygitalToken: string,
  target?: SettingsTarget
): string {
  if (!target) return walletHref(phygitalToken, "settings");
  return walletHref(phygitalToken, "settings", settingsSegment(target));
}

/** Soft-deny / fee codes → settings leaf (or hub). */
export function settingsFromDenyCode(
  code?: string
): SettingsTarget | undefined {
  if (code === "spend_limit") return "spendingLimits";
  if (code === "program_not_allowed" || code === "instruction_not_allowed") {
    return "extraPrograms";
  }
  if (code === "origin_not_allowed") return "allowedOrigins";
  if (code === "insufficient_fee_balance") return "feeBalance";
  return undefined;
}

/** Send route with optional preselected mint / collectible. */
export function walletSendHref(
  phygitalToken: string,
  asset?: { mint: string; collectible?: boolean } | null
): string {
  const base = walletHref(phygitalToken, "send");
  if (!asset) return base;
  const q = new URLSearchParams();
  if (asset.collectible) q.set("collectible", asset.mint);
  else q.set("mint", asset.mint);
  return `${base}?${q.toString()}`;
}

function rejectUnsafeReturn(raw: string): boolean {
  if (!raw.startsWith("/token")) return true;
  if (raw.startsWith("//")) return true;
  if (/[\x00-\x1f\\]/.test(raw)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return true;
  if (raw.includes("..")) return true;
  return false;
}

export type ParsedTokenPath =
  | { kind: "card"; token: string; path: string }
  | { kind: "wallet"; token: string; segments: string[]; path: string };

/**
 * Parse `/token/{address}` or `/token/{address}/wallet(/…)?`.
 * Returns null for anything outside the allowlist.
 */
export function parseTokenWalletPath(
  raw: string | null | undefined
): ParsedTokenPath | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (rejectUnsafeReturn(trimmed)) return null;

  try {
    const u = new URL(trimmed, "https://revibase.invalid");
    if (u.username || u.password || u.host !== "revibase.invalid") return null;
    if (u.search || u.hash) return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== "token" || parts.length < 2) return null;

    const addressRaw = decodeURIComponent(parts[1]!);
    if (addressRaw.includes("/") || addressRaw.includes("..")) return null;
    const token = tryParseAddress(addressRaw);
    if (!token) return null;
    const tokenStr = String(token);

    if (parts.length === 2) {
      return { kind: "card", token: tokenStr, path: tokenHref(tokenStr) };
    }

    if (parts[2] !== "wallet") return null;

    const rest = parts.slice(3).map((p) => decodeURIComponent(p));
    if (rest.some((p) => p.includes("..") || p === "")) return null;

    const wallet = (segments: string[], path: string): ParsedTokenPath => ({
      kind: "wallet",
      token: tokenStr,
      segments,
      path,
    });

    if (rest.length === 0) {
      return wallet([], walletHref(tokenStr));
    }

    if (rest[0] === "receive" && rest.length === 1) {
      return wallet(rest, walletHref(tokenStr, "receive"));
    }
    if (rest[0] === "receive" && rest[1] === "nearby" && rest.length === 2) {
      return wallet(rest, walletHref(tokenStr, "receive", "nearby"));
    }

    if (rest[0] === "collectibles" && rest.length === 1) {
      return wallet(rest, walletHref(tokenStr, "collectibles"));
    }
    if (rest[0] === "collectibles" && rest.length === 2) {
      const mint = tryParseAddress(rest[1]);
      if (!mint) return null;
      return wallet(
        ["collectibles", String(mint)],
        walletHref(tokenStr, "collectibles", String(mint))
      );
    }

    if (rest[0] === "settings" && rest.length === 1) {
      return wallet(rest, walletHref(tokenStr, "settings"));
    }
    if (rest[0] === "settings" && rest.length === 2) {
      const target = settingsFromSegment(rest[1]);
      if (!target) return null;
      return wallet(
        ["settings", settingsSegment(target)],
        walletSettingsHref(tokenStr, target)
      );
    }

    if (rest.length === 1 && WALLET_LEAF_SEGMENTS.has(rest[0]!)) {
      return wallet(rest, walletHref(tokenStr, rest[0]!));
    }

    return null;
  } catch {
    return null;
  }
}
