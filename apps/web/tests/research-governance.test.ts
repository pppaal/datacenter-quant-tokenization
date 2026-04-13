import assert from 'node:assert/strict';
import test from 'node:test';
import { approveResearchHouseViewSnapshot } from '@/lib/services/research/governance';

test('approveResearchHouseViewSnapshot creates immutable approved lineage and supersedes prior approval', async () => {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const creates: Array<Record<string, unknown>> = [];

  const txSnapshot = {
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      updates.push({ where, data });
      return { id: where.id, ...data };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      creates.push(data);
      return { id: 'approved-new', ...data };
    }
  };

  const db = {
    researchSnapshot: {
      findUnique: async () => ({
        id: 'draft-1',
        snapshotKey: 'market:kr-office',
        assetId: null,
        marketUniverseId: 'market-1',
        submarketId: null,
        snapshotType: 'market-thesis',
        viewType: 'HOUSE' as const,
        approvalStatus: 'DRAFT' as const,
        title: 'Korea Office market thesis',
        summary: 'Draft office house view',
        snapshotDate: new Date('2026-04-09T00:00:00.000Z'),
        sourceSystem: 'research-market-aggregate',
        freshnessStatus: 'FRESH',
        freshnessLabel: '2d old',
        metrics: { assetCount: 2 },
        provenance: { sources: ['approvedEvidence'] }
      }),
      findFirst: async () => ({
        id: 'approved-old'
      })
    },
    $transaction: async (fn: any) => fn({ researchSnapshot: txSnapshot })
  };

  const approved = await approveResearchHouseViewSnapshot(
    'draft-1',
    {
      userId: 'user-1',
      identifier: 'admin@nexus.local'
    },
    db as never
  );

  assert.equal(approved.id, 'approved-new');
  assert.equal(creates.length, 1);
  assert.equal(creates[0]?.approvalStatus, 'APPROVED');
  assert.equal(creates[0]?.viewType, 'HOUSE');
  assert.equal(creates[0]?.approvedById, 'user-1');
  assert.equal(creates[0]?.supersedesSnapshotId, 'approved-old');
  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map((item) => item.where.id),
    ['approved-old', 'draft-1']
  );
});

test('approveResearchHouseViewSnapshot rejects source-view snapshots', async () => {
  const db = {
    researchSnapshot: {
      findUnique: async () => ({
        id: 'source-1',
        snapshotKey: 'official:reb:office',
        assetId: null,
        marketUniverseId: 'market-1',
        submarketId: null,
        snapshotType: 'market-official-source',
        viewType: 'SOURCE' as const,
        approvalStatus: 'APPROVED' as const,
        title: 'REB Office indicators',
        summary: 'Source indicators',
        snapshotDate: new Date('2026-04-09T00:00:00.000Z'),
        sourceSystem: 'korea-reb-property-statistics',
        freshnessStatus: 'FRESH',
        freshnessLabel: 'fresh',
        metrics: null,
        provenance: null
      }),
      findFirst: async () => null,
      update: async () => {
        throw new Error('should not update source snapshots');
      },
      create: async () => {
        throw new Error('should not create approved source snapshots');
      }
    }
  };

  await assert.rejects(
    () =>
      approveResearchHouseViewSnapshot(
        'source-1',
        {
          userId: 'user-1',
          identifier: 'admin@nexus.local'
        },
        db as never
      ),
    /Only house-view research snapshots can be approved/
  );
});

test('approveResearchHouseViewSnapshot throws when snapshot is not found', async () => {
  const db = {
    researchSnapshot: {
      findUnique: async () => null,
      findFirst: async () => null,
      update: async () => { throw new Error('should not update'); },
      create: async () => { throw new Error('should not create'); }
    },
    $transaction: async (fn: any) => fn(db)
  };

  await assert.rejects(
    () =>
      approveResearchHouseViewSnapshot(
        'nonexistent',
        { userId: 'user-1', identifier: 'admin@nexus.local' },
        db as never
      ),
    /Research snapshot not found/
  );
});

test('approveResearchHouseViewSnapshot works when no previous approved snapshot exists', async () => {
  const creates: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];

  const baseTx = {
    researchSnapshot: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ where, data });
        return { id: where.id, ...data };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creates.push(data);
        return { id: 'approved-first', ...data };
      }
    }
  };

  const db = {
    researchSnapshot: {
      findUnique: async () => ({
        id: 'draft-first',
        snapshotKey: 'market:kr-dc',
        assetId: 'asset-1',
        marketUniverseId: null,
        submarketId: null,
        snapshotType: 'market-thesis',
        viewType: 'HOUSE' as const,
        approvalStatus: 'DRAFT' as const,
        title: 'DC market thesis',
        summary: 'First house view',
        snapshotDate: new Date('2026-04-10T00:00:00.000Z'),
        sourceSystem: 'research-aggregate',
        freshnessStatus: 'FRESH',
        freshnessLabel: '1d old',
        metrics: {},
        provenance: null
      }),
      findFirst: async () => null
    },
    $transaction: async (fn: any) => fn(baseTx)
  };

  const approved = await approveResearchHouseViewSnapshot(
    'draft-first',
    { userId: 'user-2', identifier: 'analyst@nexus.local' },
    db as never
  );

  assert.equal(approved.id, 'approved-first');
  assert.equal(creates.length, 1);
  assert.equal(creates[0]?.supersedesSnapshotId, null);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.where.id, 'draft-first');
  assert.equal(updates[0]?.data.approvalStatus, 'DRAFT');
});
