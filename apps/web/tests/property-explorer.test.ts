import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, AssetStage, AssetStatus } from '@prisma/client';
import {
  bootstrapPropertyCandidate,
  buildPropertyExplorerData
} from '@/lib/services/property-explorer';

test('property explorer marks linked dossiers and summarizes candidate counts', async () => {
  const fakeDb = {
    asset: {
      async findMany() {
        return [
          {
            id: 'asset_1',
            assetCode: 'SEOUL-YEOUIDO-01',
            name: 'Yeouido Core Office Tower',
            assetClass: AssetClass.OFFICE,
            address: {
              parcelId: '11560-2030-0101'
            },
            siteProfile: null,
            marketSnapshot: null,
            valuations: []
          }
        ];
      }
    }
  };

  const result = await buildPropertyExplorerData(fakeDb as any);
  assert.equal(result.stats.candidateCount, 4);
  assert.equal(result.stats.linkedAssetCount, 1);
  assert.equal(result.stats.untrackedCount, 3);
  assert.equal(result.stats.officeCount, 2);
  assert.equal(result.stats.dataCenterCount, 2);
  assert.equal(
    result.candidates.find((candidate) => candidate.assetCode === 'SEOUL-YEOUIDO-01')
      ?.linkedAssetId,
    'asset_1'
  );
});

test('bootstrapPropertyCandidate returns an existing dossier when the property is already tracked', async () => {
  const fakeDb = {
    asset: {
      async findFirst() {
        return {
          id: 'asset_yeouido',
          assetCode: 'SEOUL-YEOUIDO-01',
          name: 'Yeouido Core Office Tower'
        };
      }
    }
  };

  const result = await bootstrapPropertyCandidate('explorer_yeouido_core_office', fakeDb as any);
  assert.equal(result.id, 'asset_yeouido');
});

test('bootstrapPropertyCandidate opens a new intake dossier when the property is not yet tracked', async () => {
  let captured: any;

  const fakeDb = {
    asset: {
      async findFirst() {
        return null;
      },
      async create(args: any) {
        captured = args;
        return {
          id: 'asset_new',
          ...args.data
        };
      }
    }
  };

  await bootstrapPropertyCandidate('explorer_pangyo_office_park', fakeDb as any);

  assert.equal(captured.data.assetCode, 'SEONGNAM-PANGYO-01');
  assert.equal(captured.data.assetClass, AssetClass.OFFICE);
  assert.equal(captured.data.status, AssetStatus.INTAKE);
  assert.equal(captured.data.stage, AssetStage.SCREENING);
  assert.equal(captured.data.address.create.city, 'Seongnam');
  assert.equal(captured.data.address.create.parcelId, '41135-1100-0244');
  assert.match(captured.data.description, /Pangyo office demand/i);
});

test('bootstrapPropertyCandidate throws for unknown candidate id', async () => {
  const fakeDb = {
    asset: {
      async findFirst() {
        return null;
      }
    }
  };

  await assert.rejects(
    () => bootstrapPropertyCandidate('nonexistent_id', fakeDb as any),
    /Property candidate not found/
  );
});

test('property explorer correctly identifies data center candidates', async () => {
  const fakeDb = {
    asset: {
      async findMany() {
        return [];
      }
    }
  };

  const result = await buildPropertyExplorerData(fakeDb as any);

  const dcCandidates = result.candidates.filter((c) => c.assetClass === AssetClass.DATA_CENTER);
  assert.equal(dcCandidates.length, 2);

  for (const candidate of dcCandidates) {
    assert.ok(candidate.mapPosition.leftPct >= 8, 'left position should be >= 8%');
    assert.ok(candidate.mapPosition.leftPct <= 92, 'left position should be <= 92%');
    assert.ok(candidate.mapPosition.topPct >= 8, 'top position should be >= 8%');
    assert.ok(candidate.mapPosition.topPct <= 92, 'top position should be <= 92%');
  }
});

test('property explorer links assets by parcelId when assetCode does not match', async () => {
  const fakeDb = {
    asset: {
      async findMany() {
        return [
          {
            id: 'asset_by_parcel',
            assetCode: 'DIFFERENT-CODE',
            name: 'Matched by parcel',
            assetClass: AssetClass.DATA_CENTER,
            address: {
              parcelId: '11500-2034-0007'
            },
            siteProfile: null,
            marketSnapshot: null,
            valuations: []
          }
        ];
      }
    }
  };

  const result = await buildPropertyExplorerData(fakeDb as any);
  const gangseo = result.candidates.find((c) => c.assetCode === 'SEOUL-GANGSEO-01');
  assert.equal(gangseo?.linkedAssetId, 'asset_by_parcel');
  assert.equal(gangseo?.hasLiveDossier, true);
});
