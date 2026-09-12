import {
  address,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { getTransferV1Instruction } from "@macalinao/clients-mpl-core";

import { dasGetAsset } from "@/lib/solana/das-rpc";

const SPL_NOOP_PROGRAM_ID = address(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

/** Mpl Core TransferV1 via Codama Kit client. */
export async function buildCoreTransferInstructions(args: {
  asset: Address;
  authority: TransactionSigner;
  newOwner: Address;
}): Promise<Instruction[]> {
  const das = await dasGetAsset(String(args.asset));
  if (!das?.id) throw new Error("getAsset returned no asset");
  const collection = das.grouping?.find(
    (g) => g.group_key === "collection"
  )?.group_value;

  return [
    getTransferV1Instruction({
      asset: args.asset,
      collection: collection ? address(collection) : undefined,
      payer: args.authority,
      authority: args.authority,
      newOwner: args.newOwner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      transferV1Args: { compressionProof: null },
    }) as Instruction,
  ];
}
