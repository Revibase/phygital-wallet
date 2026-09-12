import {
  address,
  type Address,
  type Instruction,
  isSome,
  getBase64Encoder,
  type TransactionSigner,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import {
  findMasterEditionPda,
  findMetadataPda,
  findTokenRecordPda,
  getMetadataDecoder,
  getTransferV1Instruction,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata-kit";

import { getSolanaRpc } from "@/lib/solana/rpc";

const AUTH_RULES_PROGRAM = address(
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg"
);

/**
 * Metaplex Token Metadata TransferV1 for programmable NFTs.
 * Kit Instruction[] — wallet signer is authority + payer.
 */
export async function buildPnftTransferInstructions(args: {
  mint: Address;
  owner: Address;
  authority: TransactionSigner;
  recipient: Address;
  tokenProgram: Address;
}): Promise<Instruction[]> {
  const rpc = getSolanaRpc();
  const { mint, owner, authority, recipient, tokenProgram } = args;

  const [[ownerAta], [recipientAta], [metadataPda], [editionPda]] =
    await Promise.all([
      findAssociatedTokenPda({ mint, owner, tokenProgram }),
      findAssociatedTokenPda({ mint, owner: recipient, tokenProgram }),
      findMetadataPda({ mint }),
      findMasterEditionPda({ mint }),
    ]);

  const [[ownerTokenRecord], [destinationTokenRecord]] = await Promise.all([
    findTokenRecordPda({ mint, token: ownerAta }),
    findTokenRecordPda({ mint, token: recipientAta }),
  ]);

  const accountInfo = await rpc
    .getAccountInfo(metadataPda, { encoding: "base64" })
    .send();
  if (!accountInfo.value?.data) {
    throw new Error("Unable to find token metadata account");
  }
  const raw = Array.isArray(accountInfo.value.data)
    ? accountInfo.value.data[0]
    : accountInfo.value.data;
  if (typeof raw !== "string") {
    throw new Error("Unexpected metadata encoding");
  }
  const metadata = getMetadataDecoder().decode(getBase64Encoder().encode(raw));

  let authorizationRules: Address | undefined;
  const programmableConfig = metadata.programmableConfig;
  if (isSome(programmableConfig) && programmableConfig.value.__kind === "V1") {
    const ruleSet = programmableConfig.value.ruleSet;
    if (isSome(ruleSet)) {
      authorizationRules = ruleSet.value;
    }
  }

  const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    payer: authority,
    ata: recipientAta,
    owner: recipient,
    mint,
    tokenProgram,
  });

  const transferIx = getTransferV1Instruction({
    mint,
    tokenOwner: owner,
    destinationOwner: recipient,
    token: ownerAta,
    destinationToken: recipientAta,
    metadata: metadataPda,
    edition: editionPda,
    tokenRecord: ownerTokenRecord,
    destinationTokenRecord,
    authority,
    payer: authority,
    splTokenProgram: tokenProgram,
    tokenStandard: TokenStandard.ProgrammableNonFungible,
    amount: 1n,
    authorizationRulesProgram: AUTH_RULES_PROGRAM,
    authorizationRules,
  }) as Instruction;

  return [createAtaIx, transferIx];
}
