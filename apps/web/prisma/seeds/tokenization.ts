import { type PrismaClient } from '@prisma/client';
import { buildMockTxHash } from '../../lib/blockchain/mock-mode';

// Dev/demo default chain id (matches lib/blockchain/config.ts fallback).
const CHAIN_ID = 31337;

// Assets that have completed a (mock) ERC-3643 tokenization deployment in the
// demo. Kept to the two most mature dossiers.
const TOKENIZED_ASSET_CODES = ['SEOUL-YEOUIDO-01', 'SEOUL-GANGSEO-01'];

function mockAddress(...parts: Array<string | number>): string {
  return `0x${buildMockTxHash(...parts).slice(2, 42)}`;
}

/**
 * Seeds deterministic mock ERC-3643 tokenization deployments for the mature
 * demo assets, so /admin/tokenization and the dossier tokenization panel show
 * data. Addresses and tx hashes are derived via buildMockTxHash so they stay
 * stable across re-seeds. Cleaned up by the asset cascade on re-seed.
 */
export async function seedTokenization(prisma: PrismaClient): Promise<void> {
  let deploymentBlock = 1_000_000;

  for (const assetCode of TOKENIZED_ASSET_CODES) {
    const asset = await prisma.asset.findUnique({
      where: { assetCode },
      select: { id: true }
    });
    if (!asset) continue;

    deploymentBlock += 1_234;

    await prisma.tokenizedAsset.create({
      data: {
        assetId: asset.id,
        chainId: CHAIN_ID,
        registryAssetId: buildMockTxHash('registry', assetCode).slice(2, 18),
        tokenAddress: mockAddress('token', assetCode),
        identityRegistryAddress: mockAddress('identity', assetCode),
        complianceAddress: mockAddress('compliance', assetCode),
        maxHoldersModuleAddress: mockAddress('maxholders', assetCode),
        countryRestrictModuleAddress: mockAddress('country', assetCode),
        lockupModuleAddress: mockAddress('lockup', assetCode),
        deploymentBlock,
        deploymentTxHash: buildMockTxHash('deploy', assetCode),
        paused: false
      }
    });
  }
}
