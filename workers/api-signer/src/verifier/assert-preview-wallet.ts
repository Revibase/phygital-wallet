import { address, isSignerRole, type Instruction } from "@solana/kit";
import { findWalletPda } from "phygital-wallet-sdk";

import { parseConfigIntent } from "@/verifier/config-intent";

/**
 * Validate that previewed instructions belong to this token. Execute intents
 * must include the wallet PDA as a signer; a config change (which has no
 * wallet-PDA signer — its signers are payer/verifier) is valid instead when it
 * targets this `phygitalToken`. Config always soft-denies downstream, so this
 * only gates *whose* inbox an intent may reach.
 */
export async function assertPreviewWalletSigner(
  phygitalToken: string,
  instructions: readonly Instruction[],
): Promise<void> {
  let configChange: ReturnType<typeof parseConfigIntent> = null;
  for (const ix of instructions) {
    configChange = parseConfigIntent(ix);
    if (configChange) break;
  }
  if (configChange) {
    if (configChange.phygitalToken !== phygitalToken) {
      throw Object.assign(
        new Error("Config change targets a different token"),
        {
          code: "invalid_transaction",
          details: { phygitalToken, configToken: configChange.phygitalToken },
        },
      );
    }
    return;
  }

  let walletPda: string;
  try {
    const [pda] = await findWalletPda({
      phygitalToken: address(phygitalToken),
    });
    walletPda = String(pda);
  } catch {
    throw Object.assign(new Error("Invalid phygitalToken"), {
      code: "invalid_transaction",
    });
  }

  const isSigner = instructions.some((ix) =>
    (ix.accounts ?? []).some((a) => {
      if (String(a.address) !== walletPda) return false;
      return isSignerRole(a.role);
    }),
  );

  if (!isSigner) {
    throw Object.assign(
      new Error("Preview instructions must include the wallet PDA as a signer"),
      {
        code: "invalid_transaction",
        details: { phygitalToken, walletPda },
      },
    );
  }
}
