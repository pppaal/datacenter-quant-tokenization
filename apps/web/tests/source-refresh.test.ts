import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceRefreshTriggerType } from '@prisma/client';
import {
  getSourceRefreshHealth,
  runScheduledSourceRefresh,
  runSourceRefreshJob
} from '@/lib/services/source-refresh';

test('scheduled source refresh selects stale assets and reports stale source systems', async () => {
  process.env.SOURCE_REFRESH_STALE_HOURS = '24';
  process.env.SOURCE_REFRESH_BATCH_SIZE = '2';

  const now = new Date('2026-03-21T06:00:00.000Z');
  const refreshedIds: string[] = [];

  const fakeDb = {
    sourceCache: {
      async findMany() {
        return [
          {
            sourceSystem: 'nasa-power',
            cacheKey: 'asset-1',
            status: 'FRESH',
            freshnessLabel: 'nasa power + gpm/firms nrt',
            fetchedAt: new Date('2026-03-21T05:30:00.000Z'),
            expiresAt: new Date('2026-03-22T05:30:00.000Z')
          },
          {
            sourceSystem: 'nasa-gpm-imerg',
            cacheKey: 'asset-1',
            status: 'STALE',
            freshnessLabel: 'overlay unavailable',
            fetchedAt: new Date('2026-03-20T01:00:00.000Z'),
            expiresAt: new Date('2026-03-20T05:00:00.000Z')
          },
          {
            sourceSystem: 'nasa-firms',
            cacheKey: 'asset-1',
            status: 'FAILED',
            freshnessLabel: 'map key not configured',
            fetchedAt: new Date('2026-03-19T01:00:00.000Z'),
            expiresAt: new Date('2026-03-19T05:00:00.000Z')
          }
        ];
      }
    },
    asset: {
      async findMany(args: any) {
        const baseAssets = [
          {
            id: 'asset_stale_1',
            assetCode: 'SEOUL-OLD-01',
            name: 'Old Seoul Case',
            lastEnrichedAt: new Date('2026-03-19T00:00:00.000Z'),
            updatedAt: new Date('2026-03-21T01:00:00.000Z'),
            address: { city: 'Seoul' }
          },
          {
            id: 'asset_stale_2',
            assetCode: 'INCHEON-OLD-01',
            name: 'Old Incheon Case',
            lastEnrichedAt: null,
            updatedAt: new Date('2026-03-21T00:30:00.000Z'),
            address: { city: 'Incheon' }
          },
          {
            id: 'asset_fresh_1',
            assetCode: 'BUSAN-FRESH-01',
            name: 'Fresh Busan Case',
            lastEnrichedAt: new Date('2026-03-21T04:30:00.000Z'),
            updatedAt: new Date('2026-03-21T04:40:00.000Z'),
            address: { city: 'Busan' }
          }
        ];

        if (args?.take) {
          return baseAssets
            .filter(
              (asset) =>
                !asset.lastEnrichedAt || asset.lastEnrichedAt < new Date('2026-03-20T06:00:00.000Z')
            )
            .slice(0, args.take)
            .map(({ address, ...asset }) => asset);
        }

        return baseAssets;
      }
    }
  };

  const health = await getSourceRefreshHealth(fakeDb as any, now);
  assert.equal(health.sourceFreshness.total, 17);
  assert.equal(health.sourceFreshness.fresh, 1);
  assert.equal(health.sourceFreshness.stale, 1);
  assert.equal(health.sourceFreshness.failed, 15);
  assert.equal(health.assetFreshness.staleCandidates, 2);
  assert.ok(health.sourceFreshness.staleSystems.includes('nasa-gpm-imerg'));
  assert.ok(health.sourceFreshness.staleSystems.includes('nasa-firms'));

  const summary = await runScheduledSourceRefresh(fakeDb as any, {
    now,
    enrich: async (assetId: string) => {
      refreshedIds.push(assetId);
      if (assetId === 'asset_stale_2') {
        throw new Error('refresh_failed');
      }
      return null as any;
    }
  });

  assert.deepEqual(refreshedIds, ['asset_stale_1', 'asset_stale_2']);
  assert.equal(summary.assetFreshness.refreshed, 1);
  assert.equal(summary.assetFreshness.failed, 1);
  assert.equal(summary.results[1]?.message, 'refresh_failed');
});

test('runSourceRefreshJob persists refresh run summary and actor metadata', async () => {
  process.env.SOURCE_REFRESH_STALE_HOURS = '24';
  process.env.SOURCE_REFRESH_BATCH_SIZE = '3';

  const persistedRuns: Array<Record<string, unknown>> = [];

  const fakeDb = {
    sourceCache: {
      async findMany() {
        return [
          {
            sourceSystem: 'nasa-power',
            cacheKey: 'asset-1',
            status: 'FRESH',
            freshnessLabel: 'current',
            fetchedAt: new Date('2026-03-21T05:30:00.000Z'),
            expiresAt: new Date('2026-03-22T05:30:00.000Z')
          }
        ];
      }
    },
    asset: {
      async findMany(args: any) {
        const assets = [
          {
            id: 'asset_stale_1',
            assetCode: 'SEOUL-OLD-01',
            name: 'Old Seoul Case',
            lastEnrichedAt: new Date('2026-03-19T00:00:00.000Z'),
            updatedAt: new Date('2026-03-21T01:00:00.000Z'),
            address: { city: 'Seoul' }
          }
        ];

        if (args?.take) {
          return assets.map(({ address, ...asset }) => asset);
        }

        return assets;
      }
    },
    sourceRefreshRun: {
      async create({ data }: any) {
        const row = {
          id: 'run_1',
          startedAt: new Date('2026-03-21T06:00:00.000Z'),
          finishedAt: null,
          errorSummary: null,
          metadata: null,
          ...data
        };
        persistedRuns.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = persistedRuns.find((item) => item.id === where.id);
        if (!row) {
          throw new Error('run missing');
        }
        Object.assign(row, data);
        return row;
      }
    }
  };

  const summary = await runSourceRefreshJob(
    {
      triggerType: SourceRefreshTriggerType.MANUAL,
      actorIdentifier: 'analyst@example.com'
    },
    fakeDb as any,
    {
      now: new Date('2026-03-21T06:00:00.000Z'),
      enrich: async () => null as any
    }
  );

  assert.equal(summary.id, 'run_1');
  assert.equal(summary.triggerType, SourceRefreshTriggerType.MANUAL);
  assert.equal(summary.statusLabel, 'SUCCESS');
  assert.equal(summary.refreshedByActor, 'analyst@example.com');
  assert.equal(summary.assetCandidateCount, 1);
  assert.equal(summary.refreshedAssetCount, 1);
  assert.equal(summary.failedAssetCount, 0);
});
