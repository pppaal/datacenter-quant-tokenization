import type { PrismaClient, TokenizedAsset } from '@prisma/client';
import type { Address } from 'viem';
import { prisma } from '@/lib/db/prisma';
import type { TokenizationDeploymentRow } from './tokenization-client';

export function toDeploymentRow(row: TokenizedAsset): TokenizationDeploymentRow {
  return {
    chainId: row.chainId,
    tokenAddress: row.tokenAddress as Address,
    identityRegistryAddress: row.identityRegistryAddress as Address,
    complianceAddress: row.complianceAddress as Address,
    countryRestrictModuleAddress: (row.countryRestrictModuleAddress as Address | null) ?? null
  };
}

export async function getDeploymentByAssetId(
  assetId: string,
  db: PrismaClient = prisma
): Promise<TokenizedAsset | null> {
  return db.tokenizedAsset.findUnique({ where: { assetId } });
}

export async function requireDeploymentByAssetId(
  assetId: string,
  db: PrismaClient = prisma
): Promise<TokenizedAsset & { asset: { assetCode: string; name: string } }> {
  const row = await db.tokenizedAsset.findUnique({
    where: { assetId },
    include: { asset: { select: { assetCode: true, name: true } } }
  });
  if (!row) throw new Error(`No tokenization deployment recorded for assetId=${assetId}`);
  return row;
}

export type UpsertTokenizedAssetInput = {
  assetId: string;
  chainId: number;
  registryAssetId: string;
  tokenAddress: string;
  identityRegistryAddress: string;
  complianceAddress: string;
  maxHoldersModuleAddress?: string | null;
  countryRestrictModuleAddress?: string | null;
  lockupModuleAddress?: string | null;
  deploymentBlock: number;
  deploymentTxHash?: string | null;
};

export async function upsertTokenizedAsset(
  input: UpsertTokenizedAssetInput,
  db: PrismaClient = prisma
): Promise<TokenizedAsset> {
  return db.tokenizedAsset.upsert({
    where: { assetId: input.assetId },
    create: {
      assetId: input.assetId,
      chainId: input.chainId,
      registryAssetId: input.registryAssetId,
      tokenAddress: input.tokenAddress,
      identityRegistryAddress: input.identityRegistryAddress,
      complianceAddress: input.complianceAddress,
      maxHoldersModuleAddress: input.maxHoldersModuleAddress ?? null,
      countryRestrictModuleAddress: input.countryRestrictModuleAddress ?? null,
      lockupModuleAddress: input.lockupModuleAddress ?? null,
      deploymentBlock: input.deploymentBlock,
      deploymentTxHash: input.deploymentTxHash ?? null
    },
    update: {
      chainId: input.chainId,
      registryAssetId: input.registryAssetId,
      tokenAddress: input.tokenAddress,
      identityRegistryAddress: input.identityRegistryAddress,
      complianceAddress: input.complianceAddress,
      maxHoldersModuleAddress: input.maxHoldersModuleAddress ?? null,
      countryRestrictModuleAddress: input.countryRestrictModuleAddress ?? null,
      lockupModuleAddress: input.lockupModuleAddress ?? null,
      deploymentBlock: input.deploymentBlock,
      deploymentTxHash: input.deploymentTxHash ?? null
    }
  });
}

export async function listTokenizedAssets(
  db: PrismaClient = prisma
): Promise<Array<TokenizedAsset & { asset: { assetCode: string; name: string } }>> {
  return db.tokenizedAsset.findMany({
    include: { asset: { select: { assetCode: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  });
}
