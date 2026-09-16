/**
 * Decode Solana transaction v1 for signing via @solana/kit codecs.
 *
 * Kit (`MAX_SUPPORTED_TRANSACTION_VERSION = 1`) owns the wire format. We only
 * add a pre-parse size cap (§32) and require version === 1. Sign the EXACT
 * `messageBytes` returned by the decoder — never a re-encode (§22, §39).
 */

import {
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Transaction,
  type TransactionMessage,
  type TransactionMessageWithFeePayer,
  type TransactionMessageWithLifetime,
} from "@solana/kit";

import { MAX_TX_BYTES } from "../constants.js";

export class TxError extends Error {}

export type DecodedV1Transaction = {
  version: 1;
  /** Exact bytes the Ed25519 signature covers. Sign THESE, unchanged. */
  messageBytes: Uint8Array;
  /** Kit wire transaction (signatures map + message bytes). */
  transaction: Transaction;
  /** Decompiled application message (instructions + optional v1 config). */
  message: TransactionMessage &
    TransactionMessageWithFeePayer &
    TransactionMessageWithLifetime & { version: 1 };
};

const txDecoder = getTransactionDecoder();
const messageDecoder = getCompiledTransactionMessageDecoder();

/** Decode + require v1. Rejects legacy/v0 and oversized input. */
export function decodeV1Transaction(bytes: Uint8Array): DecodedV1Transaction {
  if (bytes.length < 1) throw new TxError("empty");
  if (bytes.length > MAX_TX_BYTES) throw new TxError("too large");

  try {
    const transaction = txDecoder.decode(bytes);
    const [compiled, end] = messageDecoder.read(transaction.messageBytes, 0);
    if (end !== transaction.messageBytes.length) {
      throw new TxError("trailing bytes");
    }
    if (compiled.version !== 1) {
      throw new TxError("not a v1 transaction");
    }
    const message = decompileTransactionMessage(compiled);
    if (message.version !== 1) {
      throw new TxError("not a v1 transaction");
    }
    return {
      version: 1,
      messageBytes: new Uint8Array(transaction.messageBytes),
      transaction,
      message,
    };
  } catch (e) {
    if (e instanceof TxError) throw e;
    throw new TxError(e instanceof Error ? e.message : "malformed");
  }
}
