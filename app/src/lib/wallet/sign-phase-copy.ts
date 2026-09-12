import type { PhygitalWalletSignPhase } from "phygital-wallet-sdk";

import { copy } from "@/lib/copy/phygital";

export type { PhygitalWalletSignPhase };

/**
 * Keep the form mounted through preview; ceremony phases may swap to the NFC
 * hold UI.
 */
export function isWalletSignCeremonyPhase(
  phase: PhygitalWalletSignPhase
): boolean {
  return (
    phase === "awaitingPasskey" ||
    phase === "building" ||
    phase === "coSigning" ||
    phase === "complete"
  );
}

/** Title, body, and NFC pulse for each wallet-signer phase. */
export function walletSignPhaseCopy(phase: PhygitalWalletSignPhase): {
  title: string;
  body: string;
  /** Pulse the hold orb — only while waiting for the accessory tap. */
  pulse: boolean;
} {
  switch (phase) {
    case "preparing":
      return {
        title: copy.wallet.signPreparingTitle,
        body: copy.wallet.signPreparingBody,
        pulse: false,
      };
    case "previewing":
      return {
        title: copy.wallet.signPreviewingTitle,
        body: copy.wallet.signPreviewingBody,
        pulse: false,
      };
    case "awaitingPasskey":
      return {
        title: copy.wallet.signAwaitingPasskeyTitle,
        body: copy.wallet.signAwaitingPasskeyBody,
        pulse: true,
      };
    case "building":
      return {
        title: copy.wallet.signBuildingTitle,
        body: copy.wallet.signBuildingBody,
        pulse: false,
      };
    case "coSigning":
      return {
        title: copy.wallet.signCoSigningTitle,
        body: copy.wallet.signCoSigningBody,
        pulse: false,
      };
    case "complete":
      // Wrap finished; UI often stays here through broadcast + confirmed.
      return {
        title: copy.wallet.signSendingTitle,
        body: copy.wallet.signSendingBody,
        pulse: false,
      };
  }
}
