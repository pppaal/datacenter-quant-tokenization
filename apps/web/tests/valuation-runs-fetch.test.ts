import assert from 'node:assert/strict';
import test from 'node:test';
import { getValuationRunById, listValuationRuns } from '@/lib/services/valuations';

test('listValuationRuns stitches asset + scenarios + sensitivity relations and orders newest first', async () => {
  let receivedArgs: any;
  const fakeDb = {
    valuationRun: {
      async findMany(args: any) {
        receivedArgs = args;
        return [
          {
            id: 'run_2',
            assetId: 'asset_1',
            asset: { id: 'asset_1', address: { city: 'Seoul' }, siteProfile: { zoning: 'M1' } },
            scenarios: [{ id: 'sc_1', name: 'Base', scenarioOrder: 0 }],
            sensitivityRuns: [{ id: 'sr_1', points: [{ id: 'p_1', sortOrder: 0 }] }]
          },
          {
            id: 'run_1',
            assetId: 'asset_1',
            asset: { id: 'asset_1', address: null, siteProfile: null },
            scenarios: [],
            sensitivityRuns: []
          }
        ];
      }
    }
  };

  const result = await listValuationRuns(fakeDb as never);

  // ordering + nested ordering directives are part of the stitched contract
  assert.deepEqual(receivedArgs.orderBy, { createdAt: 'desc' });
  assert.deepEqual(receivedArgs.include.scenarios.orderBy, { scenarioOrder: 'asc' });
  assert.deepEqual(receivedArgs.include.sensitivityRuns.include.points.orderBy, {
    sortOrder: 'asc'
  });
  // asset relation pulls address + siteProfile
  assert.deepEqual(receivedArgs.include.asset.include, {
    address: true,
    siteProfile: true
  });

  assert.equal(result.length, 2);
  const first = result[0] as any;
  assert.equal(first.id, 'run_2');
  assert.equal(first.asset.address.city, 'Seoul');
  assert.equal(first.scenarios[0].name, 'Base');
  assert.equal(first.sensitivityRuns[0].points[0].id, 'p_1');
});

test('getValuationRunById fetches by id with the deep underwriting relation graph', async () => {
  let receivedArgs: any;
  const fakeDb = {
    valuationRun: {
      async findUnique(args: any) {
        receivedArgs = args;
        return {
          id: 'run_1',
          assetId: 'asset_1',
          asset: {
            id: 'asset_1',
            address: { city: 'Seoul' },
            transactionComps: [{ id: 'tc_1' }],
            creditAssessments: [{ id: 'ca_1', counterparty: { name: 'Acme' } }],
            featureSnapshots: [{ id: 'fs_1', values: [{ key: 'a' }] }]
          },
          scenarios: [{ id: 'sc_1', scenarioOrder: 0 }],
          sensitivityRuns: [{ id: 'sr_1', points: [] }]
        };
      }
    }
  };

  const result = await getValuationRunById('run_1', fakeDb as never);

  assert.deepEqual(receivedArgs.where, { id: 'run_1' });
  // bounded relation pulls (take limits) are load-bearing for the underwriting view
  assert.equal(receivedArgs.include.asset.include.transactionComps.take, 6);
  assert.equal(receivedArgs.include.asset.include.rentComps.take, 6);
  assert.equal(receivedArgs.include.asset.include.marketIndicatorSeries.take, 12);
  assert.equal(receivedArgs.include.asset.include.realizedOutcomes.take, 12);
  assert.equal(receivedArgs.include.asset.include.creditAssessments.take, 6);
  assert.equal(receivedArgs.include.asset.include.featureSnapshots.take, 16);
  assert.equal(receivedArgs.include.asset.include.valuations.take, 8);
  // creditAssessments nests counterparty + financialStatement
  assert.deepEqual(receivedArgs.include.asset.include.creditAssessments.include, {
    counterparty: true,
    financialStatement: true
  });

  assert.equal(result?.id, 'run_1');
  const asset = (result as any).asset;
  assert.equal(asset.creditAssessments[0].counterparty.name, 'Acme');
  assert.equal(asset.featureSnapshots[0].values[0].key, 'a');
});

test('getValuationRunById returns null when the run does not exist', async () => {
  const fakeDb = {
    valuationRun: {
      async findUnique() {
        return null;
      }
    }
  };

  const result = await getValuationRunById('missing', fakeDb as never);
  assert.equal(result, null);
});
