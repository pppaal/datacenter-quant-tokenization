import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeploymentByAssetId,
  listTokenizedAssets,
  requireDeploymentByAssetId,
  toDeploymentRow,
  upsertTokenizedAsset
} from '@/lib/services/onchain/tokenization-repo';

function deploymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok_1',
    assetId: 'asset_1',
    chainId: 31337,
    registryAssetId: 'reg_1',
    tokenAddress: '0x1111111111111111111111111111111111111111',
    identityRegistryAddress: '0x2222222222222222222222222222222222222222',
    complianceAddress: '0x3333333333333333333333333333333333333333',
    maxHoldersModuleAddress: null,
    countryRestrictModuleAddress: '0x4444444444444444444444444444444444444444',
    lockupModuleAddress: null,
    deploymentBlock: 100,
    deploymentTxHash: '0xabc',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  };
}

test('toDeploymentRow projects the on-chain address tuple and defaults country module to null', () => {
  const row = toDeploymentRow(deploymentRow() as never);
  assert.equal(row.chainId, 31337);
  assert.equal(row.tokenAddress, '0x1111111111111111111111111111111111111111');
  assert.equal(row.identityRegistryAddress, '0x2222222222222222222222222222222222222222');
  assert.equal(row.complianceAddress, '0x3333333333333333333333333333333333333333');
  assert.equal(row.countryRestrictModuleAddress, '0x4444444444444444444444444444444444444444');

  const noCountry = toDeploymentRow(deploymentRow({ countryRestrictModuleAddress: null }) as never);
  assert.equal(noCountry.countryRestrictModuleAddress, null);
});

test('getDeploymentByAssetId queries tokenizedAsset by assetId and passes the row through', async () => {
  let receivedWhere: unknown;
  const fakeDb = {
    tokenizedAsset: {
      async findUnique(args: any) {
        receivedWhere = args.where;
        return deploymentRow();
      }
    }
  };

  const result = await getDeploymentByAssetId('asset_1', fakeDb as never);

  assert.deepEqual(receivedWhere, { assetId: 'asset_1' });
  assert.equal(result?.assetId, 'asset_1');
  assert.equal(result?.tokenAddress, '0x1111111111111111111111111111111111111111');
});

test('getDeploymentByAssetId returns null when no deployment exists', async () => {
  const fakeDb = {
    tokenizedAsset: {
      async findUnique() {
        return null;
      }
    }
  };

  const result = await getDeploymentByAssetId('missing', fakeDb as never);
  assert.equal(result, null);
});

test('requireDeploymentByAssetId stitches the asset relation onto the deployment', async () => {
  let receivedInclude: unknown;
  const fakeDb = {
    tokenizedAsset: {
      async findUnique(args: any) {
        receivedInclude = args.include;
        return {
          ...deploymentRow(),
          asset: { assetCode: 'DC-001', name: 'Seoul DC One' }
        };
      }
    }
  };

  const result = await requireDeploymentByAssetId('asset_1', fakeDb as never);

  assert.deepEqual(receivedInclude, {
    asset: { select: { assetCode: true, name: true } }
  });
  assert.equal(result.asset.assetCode, 'DC-001');
  assert.equal(result.asset.name, 'Seoul DC One');
  assert.equal(result.assetId, 'asset_1');
});

test('requireDeploymentByAssetId throws a descriptive error when the deployment is missing', async () => {
  const fakeDb = {
    tokenizedAsset: {
      async findUnique() {
        return null;
      }
    }
  };

  await assert.rejects(
    () => requireDeploymentByAssetId('asset_404', fakeDb as never),
    /No tokenization deployment recorded for assetId=asset_404/
  );
});

test('upsertTokenizedAsset builds matching create/update payloads and defaults optional modules to null', async () => {
  let upsertArgs: any;
  const fakeDb = {
    tokenizedAsset: {
      async upsert(args: any) {
        upsertArgs = args;
        return deploymentRow({ assetId: args.where.assetId });
      }
    }
  };

  const result = await upsertTokenizedAsset(
    {
      assetId: 'asset_9',
      chainId: 8453,
      registryAssetId: 'reg_9',
      tokenAddress: '0xaaa',
      identityRegistryAddress: '0xbbb',
      complianceAddress: '0xccc',
      deploymentBlock: 555
    },
    fakeDb as never
  );

  assert.deepEqual(upsertArgs.where, { assetId: 'asset_9' });
  // optional module addresses + txHash default to null in both branches
  assert.equal(upsertArgs.create.maxHoldersModuleAddress, null);
  assert.equal(upsertArgs.create.countryRestrictModuleAddress, null);
  assert.equal(upsertArgs.create.lockupModuleAddress, null);
  assert.equal(upsertArgs.create.deploymentTxHash, null);
  assert.equal(upsertArgs.update.maxHoldersModuleAddress, null);
  assert.equal(upsertArgs.update.deploymentTxHash, null);
  // shared scalar fields land in both create and update
  assert.equal(upsertArgs.create.chainId, 8453);
  assert.equal(upsertArgs.update.chainId, 8453);
  assert.equal(upsertArgs.create.deploymentBlock, 555);
  assert.equal(result.assetId, 'asset_9');
});

test('upsertTokenizedAsset preserves provided optional module + txHash values', async () => {
  let upsertArgs: any;
  const fakeDb = {
    tokenizedAsset: {
      async upsert(args: any) {
        upsertArgs = args;
        return deploymentRow();
      }
    }
  };

  await upsertTokenizedAsset(
    {
      assetId: 'asset_1',
      chainId: 31337,
      registryAssetId: 'reg_1',
      tokenAddress: '0xaaa',
      identityRegistryAddress: '0xbbb',
      complianceAddress: '0xccc',
      maxHoldersModuleAddress: '0xddd',
      countryRestrictModuleAddress: '0xeee',
      lockupModuleAddress: '0xfff',
      deploymentBlock: 1,
      deploymentTxHash: '0x123'
    },
    fakeDb as never
  );

  assert.equal(upsertArgs.create.maxHoldersModuleAddress, '0xddd');
  assert.equal(upsertArgs.create.countryRestrictModuleAddress, '0xeee');
  assert.equal(upsertArgs.create.lockupModuleAddress, '0xfff');
  assert.equal(upsertArgs.create.deploymentTxHash, '0x123');
  assert.equal(upsertArgs.update.lockupModuleAddress, '0xfff');
});

test('listTokenizedAssets returns asset-joined rows ordered by createdAt desc', async () => {
  let receivedArgs: any;
  const fakeDb = {
    tokenizedAsset: {
      async findMany(args: any) {
        receivedArgs = args;
        return [
          { ...deploymentRow(), asset: { assetCode: 'DC-002', name: 'Busan DC' } },
          {
            ...deploymentRow({ assetId: 'asset_0' }),
            asset: { assetCode: 'DC-001', name: 'Seoul DC' }
          }
        ];
      }
    }
  };

  const result = await listTokenizedAssets(fakeDb as never);

  assert.deepEqual(receivedArgs.include, {
    asset: { select: { assetCode: true, name: true } }
  });
  assert.deepEqual(receivedArgs.orderBy, { createdAt: 'desc' });
  assert.equal(result.length, 2);
  assert.equal(result[0].asset.assetCode, 'DC-002');
  assert.equal(result[1].asset.name, 'Seoul DC');
});
