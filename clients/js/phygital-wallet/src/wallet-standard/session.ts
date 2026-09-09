import { address, type Address } from "@solana/kit";

const STORAGE_KEY = "revibase:wallet-standard:v1";

export type PhygitalWalletSession = {
  phygitalTokenPda: Address;
  walletPda: Address;
};

type StoredSessionV1 = {
  v: 1;
  phygitalTokenPda: string;
  walletPda: string;
};

function storage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadPhygitalWalletSession(): PhygitalWalletSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSessionV1>;
    if (
      parsed.v !== 1 ||
      typeof parsed.phygitalTokenPda !== "string" ||
      typeof parsed.walletPda !== "string" ||
      !parsed.phygitalTokenPda ||
      !parsed.walletPda
    ) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      phygitalTokenPda: address(parsed.phygitalTokenPda),
      walletPda: address(parsed.walletPda),
    };
  } catch {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

export function savePhygitalWalletSession(
  session: PhygitalWalletSession,
): void {
  const store = storage();
  if (!store) return;
  const payload: StoredSessionV1 = {
    v: 1,
    phygitalTokenPda: String(session.phygitalTokenPda),
    walletPda: String(session.walletPda),
  };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — connection still works in-memory.
  }
}

export function clearPhygitalWalletSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** @internal test helper */
export const PHYGITAL_WALLET_SESSION_STORAGE_KEY = STORAGE_KEY;
