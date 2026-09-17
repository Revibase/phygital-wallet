/**
 * Decode `/sign` wire txs: fee payer + phygital token from a sponsored tx.
 */
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  getTransactionDecoder,
  AccountRole,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  parseExecuteInstruction,
  identifyPhygitalWalletInstruction,
  PhygitalWalletInstruction,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  parseExecuteWithAuthorityInstruction,
  parseSetAuthorityInstruction,
  parseClearAuthorityInstruction,
  parseSetWalletPolicyInstruction,
  parseClearWalletPolicyInstruction,
} from "phygital-wallet-sdk";

import { coded } from "@/shared/errors";

const base64Encoder = getBase64Encoder();
const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();

type WalletIx = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function asWalletInstruction(ix: Instruction): WalletIx {
  if (!ix.data?.length) {
    throw coded(
      "Phygital-wallet instruction missing data",
      "invalid_transaction",
    );
  }
  if (!ix.accounts) {
    throw coded(
      "Phygital-wallet instruction missing accounts",
      "invalid_transaction",
    );
  }
  return ix as WalletIx;
}

export type DecodedSignTx = {
  messageBytes: Uint8Array;
  /** Static account[0] — fee payer (signing checked in api-signer). */
  feePayer: string;
  phygitalToken: string;
};

export function decodeWireTransaction(base64Tx: string): DecodedSignTx {
  const bytes = new Uint8Array(base64Encoder.encode(base64Tx));
  const tx = txDecoder.decode(bytes);
  const compiled = messageDecoder.decode(tx.messageBytes);

  const feePayer = compiled.staticAccounts[0];
  if (!feePayer) {
    throw coded("Transaction has no fee payer", "invalid_transaction");
  }

  const topLevel = getInstructionsFromCompiledTransactionMessage(compiled);

  let phygitalToken: string | null = null;

  for (const ix of topLevel) {
    const program = String(ix.programAddress);
    if (program !== PHYGITAL_WALLET_PROGRAM_ADDRESS) continue;
    if (phygitalToken) {
      throw coded(
        "Transaction mixes multiple phygital-wallet instructions",
        "unexpected_instruction",
      );
    }
    const walletIx = asWalletInstruction(ix);
    const ixType = identifyPhygitalWalletInstruction(walletIx);
    switch (ixType) {
      case PhygitalWalletInstruction.Execute: {
        const expanded = parseExecuteInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      case PhygitalWalletInstruction.ExecuteWithAuthority: {
        const expanded = parseExecuteWithAuthorityInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      case PhygitalWalletInstruction.SetAuthority: {
        const expanded = parseSetAuthorityInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      case PhygitalWalletInstruction.SetWalletPolicy: {
        const expanded = parseSetWalletPolicyInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      case PhygitalWalletInstruction.ClearAuthority: {
        const expanded = parseClearAuthorityInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      case PhygitalWalletInstruction.ClearWalletPolicy: {
        const expanded = parseClearWalletPolicyInstruction(walletIx);
        phygitalToken = expanded.accounts.phygitalToken.address;
        break;
      }
      default: {
        throw coded(
          "Only phygital transactions are fee-sponsored",
          "unexpected_instruction",
        );
      }
    }
  }
  if (!phygitalToken) {
    throw coded(
      "Transaction missing phygital-wallet execute instruction",
      "unexpected_instruction",
    );
  }

  return {
    messageBytes: new Uint8Array(tx.messageBytes),
    feePayer: String(feePayer),
    phygitalToken,
  };
}
