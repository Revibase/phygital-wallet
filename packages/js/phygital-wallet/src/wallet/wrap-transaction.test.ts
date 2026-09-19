import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getCompiledTransactionMessageDecoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type TransactionVersion,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import { asV1TransactionMessage } from "./wrap-transaction.js";

const FEE_PAYER = address("11111111111111111111111111111112");
const PROGRAM = address("11111111111111111111111111111111");
const ACCOUNT = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const LOOKUP_TABLE = address("So11111111111111111111111111111111111111112");
const LIFETIME = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 100n,
};

function messageOfVersion(version: TransactionVersion) {
  return pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayer(FEE_PAYER, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(LIFETIME, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          {
            programAddress: PROGRAM,
            accounts: [{ address: ACCOUNT, role: AccountRole.WRITABLE }],
            data: new Uint8Array([1]),
          },
        ],
        m
      )
  );
}

function compiledVersion(
  message: Parameters<typeof compileTransaction>[0]
): TransactionVersion {
  const tx = compileTransaction(message);
  return getCompiledTransactionMessageDecoder().decode(tx.messageBytes).version;
}

describe("asV1TransactionMessage", () => {
  it.each(["legacy", 0, 1] as const)(
    "compiles a v1 transaction from an incoming %s message",
    (version) => {
      const incoming = messageOfVersion(version);
      expect(compiledVersion(incoming)).toBe(version);

      const v1 = asV1TransactionMessage(incoming);
      expect(v1.version).toBe(1);
      expect(compiledVersion(v1)).toBe(1);
    }
  );

  it("flattens address-lookup metas so v1 compile uses static accounts", () => {
    const incoming = {
      ...messageOfVersion(0),
      instructions: [
        {
          programAddress: PROGRAM,
          accounts: [
            {
              address: ACCOUNT,
              role: AccountRole.WRITABLE,
              lookupTableAddress: LOOKUP_TABLE,
              addressIndex: 3,
            },
          ],
          data: new Uint8Array([1]),
        },
      ],
    };

    const v1 = asV1TransactionMessage(incoming);
    expect(v1.instructions[0]?.accounts?.[0]).toEqual({
      address: ACCOUNT,
      role: AccountRole.WRITABLE,
    });
    expect(compiledVersion(v1)).toBe(1);
  });

  it("drops incoming v1 config so preview/finalize can set their own limits", () => {
    const incoming = {
      ...messageOfVersion(1),
      config: {
        computeUnitLimit: 50_000,
        priorityFeeLamports: 1n,
      },
    };

    const v1 = asV1TransactionMessage(incoming);
    expect(v1.version).toBe(1);
    expect("config" in v1 ? v1.config : undefined).toBeUndefined();
  });
});
