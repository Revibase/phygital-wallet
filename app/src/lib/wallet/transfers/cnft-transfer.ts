import {
  AccountRole,
  address,
  type Address,
  type AccountSignerMeta,
  type Instruction,
  getAddressEncoder,
  type TransactionSigner,
} from "@solana/kit";
import { getTransferInstructionAsync } from "@macalinao/clients-mpl-bubblegum";

import { dasGetAssetWithProof } from "@/lib/solana/das-rpc";

function hash32FromBase58(value: string): number[] {
  return Array.from(getAddressEncoder().encode(address(value.trim())));
}

/**
 * Bubblegum v1 transfer via Codama Kit client + DAS proof remaining accounts.
 * Leaf owner is attached as a Kit signer after the base instruction is built
 * (Codama marks that account as a plain address).
 */
export async function buildCnftTransferInstructions(args: {
  assetId: string;
  owner: Address;
  leafOwnerSigner: TransactionSigner;
  newLeafOwner: Address;
}): Promise<Instruction[]> {
  const { asset, proof: assetProof } = await dasGetAssetWithProof(args.assetId);
  if (asset.compression?.compressed !== true) {
    throw new Error("Asset is not compressed");
  }
  if (!assetProof.proof?.length) {
    throw new Error("Compressed NFT proof is empty");
  }

  const ownerStr = String(args.owner);
  if (asset.ownership?.owner && asset.ownership.owner !== ownerStr) {
    throw new Error(
      `Asset is not owned by this wallet (expected ${ownerStr}, got ${asset.ownership.owner})`,
    );
  }

  const leafNonce = asset.compression.leaf_id;
  if (leafNonce == null) {
    throw new Error("Missing compressed leaf id");
  }
  const dataHash = asset.compression.data_hash?.trim();
  const creatorHash = asset.compression.creator_hash?.trim();
  if (!dataHash || !creatorHash) {
    throw new Error("Missing compressed hash fields");
  }

  const leafDelegate = asset.ownership?.delegate
    ? address(asset.ownership.delegate)
    : address(asset.ownership?.owner ?? ownerStr);

  const base = await getTransferInstructionAsync({
    leafOwner: args.leafOwnerSigner.address,
    leafDelegate,
    newLeafOwner: args.newLeafOwner,
    merkleTree: address(assetProof.tree_id),
    root: hash32FromBase58(assetProof.root),
    dataHash: hash32FromBase58(dataHash),
    creatorHash: hash32FromBase58(creatorHash),
    nonce: BigInt(leafNonce),
    index: leafNonce,
  });

  const leafOwnerMeta: AccountSignerMeta = {
    address: args.leafOwnerSigner.address,
    role: AccountRole.READONLY_SIGNER,
    signer: args.leafOwnerSigner,
  };

  const proofPath = assetProof.proof.map((node) => ({
    address: address(node),
    role: AccountRole.READONLY as const,
  }));

  const [treeAuthority, , leafDelegateMeta, ...rest] = base.accounts;

  return [
    {
      programAddress: base.programAddress,
      data: base.data,
      accounts: [
        treeAuthority!,
        leafOwnerMeta,
        leafDelegateMeta!,
        ...rest,
        ...proofPath,
      ],
    } as Instruction,
  ];
}
