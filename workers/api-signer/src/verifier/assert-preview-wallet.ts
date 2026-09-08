import { address, isSignerRole, type Instruction } from "@solana/kit";
import { findWalletPda } from "phygital-wallet-sdk";

/**
 * Ensure `phygitalToken` maps to a wallet PDA that appears as a signer
 * on at least one preview instruction.
 */
export async function assertPreviewWalletSigner(
  phygitalToken: string,
  instructions: readonly Instruction[],
): Promise<void> {
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
      new Error(
        "Preview instructions must include the wallet PDA as a signer",
      ),
      {
        code: "invalid_transaction",
        details: { phygitalToken, walletPda },
      },
    );
  }
}
