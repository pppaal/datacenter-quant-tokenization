import type { PrismaClient, TokenDistribution } from '@prisma/client';
import type { Address, Hex } from 'viem';
import { erc20Abi } from 'viem';
import { dividendDistributorAbi } from '@/lib/blockchain/tokenization-abi';
import { getRegistryChainClients } from '@/lib/blockchain/client';
import { buildMockTxHash, isTokenizationMockMode } from '@/lib/blockchain/mock-mode';
import { prisma } from '@/lib/db/prisma';
import { ensureAddress } from './tokenization-client';
import { buildAllocationTree, type AllocationLeaf } from './distribution-merkle';

export type CreateDistributionInput = {
  tokenizedAssetId: string;
  distributorAddress: string;
  quoteAssetAddress: string;
  recordDate: Date;
  reclaimAfter: Date;
  allocations: Array<{ holder: string; amount: string }>;
};

/**
 * Build the Merkle root + per-holder proofs from raw allocations and persist
 * a `TokenDistribution` row in DRAFT status. The on-chain `createDistribution`
 * call is performed in a separate step (`fundDistribution`) so operators can
 * review the draft before broadcasting.
 */
export async function draftDistribution(
  input: CreateDistributionInput,
  db: PrismaClient = prisma
): Promise<TokenDistribution> {
  const distributor = ensureAddress(input.distributorAddress, 'distributorAddress');
  const quote = ensureAddress(input.quoteAssetAddress, 'quoteAssetAddress');
  const tokenizedAsset = await db.tokenizedAsset.findUnique({
    where: { id: input.tokenizedAssetId }
  });
  if (!tokenizedAsset) {
    throw new Error(`TokenizedAsset ${input.tokenizedAssetId} not found`);
  }
  if (input.reclaimAfter <= input.recordDate) {
    throw new Error('reclaimAfter must be strictly after recordDate');
  }

  const leaves: AllocationLeaf[] = input.allocations.map((a) => ({
    holder: ensureAddress(a.holder, 'allocation.holder'),
    amount: BigInt(a.amount)
  }));
  const tree = buildAllocationTree(leaves);

  const existing = await db.tokenDistribution.aggregate({
    where: { tokenizedAssetId: input.tokenizedAssetId },
    _max: { distId: true }
  });
  const nextDistId = (existing._max.distId ?? -1) + 1;

  return db.$transaction(async (tx) => {
    const dist = await tx.tokenDistribution.create({
      data: {
        tokenizedAssetId: input.tokenizedAssetId,
        distId: nextDistId,
        chainId: tokenizedAsset.chainId,
        distributorAddress: distributor,
        quoteAssetAddress: quote,
        merkleRoot: tree.root,
        totalAmount: tree.totalAmount.toString(),
        recordDate: input.recordDate,
        reclaimAfter: input.reclaimAfter,
        status: 'DRAFT'
      }
    });
    await tx.tokenDistributionAllocation.createMany({
      data: leaves.map((leaf) => ({
        distributionId: dist.id,
        holderAddress: leaf.holder.toLowerCase(),
        amount: leaf.amount.toString(),
        proof: tree.proofs.get(leaf.holder.toLowerCase()) ?? []
      }))
    });
    return dist;
  });
}

/**
 * Broadcast `createDistribution` for a DRAFT row. Approves the distributor
 * for the total amount first if the current allowance is insufficient.
 * Marks the row FUNDED on success and stores the tx hash.
 */
export async function fundDistribution(
  distributionId: string,
  db: PrismaClient = prisma
): Promise<{ txHash: Hex; distribution: TokenDistribution }> {
  const dist = await db.tokenDistribution.findUnique({ where: { id: distributionId } });
  if (!dist) throw new Error(`TokenDistribution ${distributionId} not found`);
  if (dist.status !== 'DRAFT') {
    throw new Error(`Distribution ${distributionId} is ${dist.status}; only DRAFT can be funded`);
  }

  const distributorAddress = dist.distributorAddress as Address;
  const quoteAddress = dist.quoteAssetAddress as Address;
  const total = BigInt(dist.totalAmount);

  let txHash: Hex;
  if (isTokenizationMockMode()) {
    txHash = buildMockTxHash('createDistribution', distributorAddress, dist.merkleRoot, total.toString());
  } else {
    const clients = getRegistryChainClients();
    if (clients.config.chainId !== dist.chainId) {
      throw new Error(
        `Chain mismatch: BLOCKCHAIN_CHAIN_ID=${clients.config.chainId} but distribution is on ${dist.chainId}`
      );
    }

    const allowance = (await clients.publicClient.readContract({
      address: quoteAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [clients.account.address, distributorAddress]
    })) as bigint;

    if (allowance < total) {
      const approveHash = await clients.walletClient.writeContract({
        address: quoteAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [distributorAddress, total]
      });
      await clients.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    txHash = await clients.walletClient.writeContract({
      address: distributorAddress,
      abi: dividendDistributorAbi,
      functionName: 'createDistribution',
      args: [
        dist.merkleRoot as Hex,
        total,
        BigInt(Math.floor(dist.recordDate.getTime() / 1000)),
        BigInt(Math.floor(dist.reclaimAfter.getTime() / 1000))
      ]
    });
  }

  const updated = await db.tokenDistribution.update({
    where: { id: dist.id },
    data: { status: 'FUNDED', txHash }
  });
  return { txHash, distribution: updated };
}

export async function getAllocationProof(input: {
  distributionId: string;
  holder: string;
  db?: PrismaClient;
}) {
  const db = input.db ?? prisma;
  const holder = ensureAddress(input.holder, 'holder').toLowerCase();
  return db.tokenDistributionAllocation.findUnique({
    where: { distributionId_holderAddress: { distributionId: input.distributionId, holderAddress: holder } }
  });
}
