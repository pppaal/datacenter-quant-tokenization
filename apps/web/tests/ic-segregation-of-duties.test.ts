import test from 'node:test';
import assert from 'node:assert/strict';
import { CommitteeDecisionOutcome, CommitteePacketStatus } from '@prisma/client';
import {
  decideCommitteePacket,
  releaseCommitteePacket,
  SegregationOfDutiesError
} from '@/lib/services/ic';

// Minimal packet fixture matching `committeePacketInclude` shape closely enough
// for the SoD code paths (status, preparedByLabel, decisions).
function buildPacket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'packet-1',
    title: 'Yeouido Packet',
    packetCode: 'PKT-1',
    status: CommitteePacketStatus.LOCKED,
    assetId: 'asset-1',
    dealId: 'deal-1',
    valuationRunId: 'val-1',
    packetFingerprint: null,
    reportFingerprint: null,
    reviewPacketFingerprint: null,
    preparedByLabel: null,
    scheduledFor: null,
    lockedAt: new Date('2026-04-12T00:00:00.000Z'),
    releasedAt: null,
    decisionSummary: null,
    followUpSummary: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-12T00:00:00.000Z'),
    meeting: null,
    asset: null,
    deal: null,
    valuationRun: null,
    decisions: [],
    ...overrides
  };
}

function buildDecideDb(packet: ReturnType<typeof buildPacket>) {
  const decisionCreates: any[] = [];
  const packetUpdates: any[] = [];
  let state = { ...packet };
  const txModels = {
    investmentCommitteePacket: {
      updateMany: async ({ where, data }: any) => {
        if (where.status && where.status !== state.status) return { count: 0 };
        state = { ...state, ...data };
        packetUpdates.push(data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => state
    },
    investmentCommitteeDecision: {
      create: async ({ data }: any) => {
        decisionCreates.push(data);
        return data;
      }
    }
  };
  const db = {
    investmentCommitteePacket: {
      findUnique: async () => packet
    },
    investmentCommitteeDecision: {
      create: txModels.investmentCommitteeDecision.create
    },
    $transaction: async (fn: any) => fn(txModels)
  } as any;
  return { db, decisionCreates, packetUpdates };
}

function buildReleaseDb(packet: ReturnType<typeof buildPacket>) {
  const packetUpdates: any[] = [];
  let state = { ...packet };
  const db = {
    investmentCommitteePacket: {
      findUnique: async () => state,
      updateMany: async ({ where, data }: any) => {
        if (where.status && where.status !== state.status) return { count: 0 };
        state = { ...state, ...data };
        packetUpdates.push(data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => state
    }
  } as any;
  return { db, packetUpdates };
}

test('SoD: the operator who locked a packet cannot record its decision', async () => {
  const packet = buildPacket({ preparedByLabel: 'Alice (ADMIN)' });
  const { db } = buildDecideDb(packet);

  await assert.rejects(
    () =>
      decideCommitteePacket(
        packet.id,
        { outcome: CommitteeDecisionOutcome.APPROVED, notes: null, followUpActions: null },
        'Alice (ADMIN)',
        db
      ),
    (error: unknown) => {
      assert.ok(error instanceof SegregationOfDutiesError);
      assert.match((error as Error).message, /locked this packet cannot record/i);
      return true;
    }
  );
});

test('SoD: locker check is case/whitespace-insensitive (no trivial bypass)', async () => {
  const packet = buildPacket({ preparedByLabel: 'Alice (ADMIN)' });
  const { db } = buildDecideDb(packet);

  await assert.rejects(
    () =>
      decideCommitteePacket(
        packet.id,
        { outcome: CommitteeDecisionOutcome.APPROVED, notes: null, followUpActions: null },
        '  alice (admin)  ',
        db
      ),
    SegregationOfDutiesError
  );
});

test('SoD: a distinct operator can decide a packet locked by someone else', async () => {
  const packet = buildPacket({ preparedByLabel: 'Alice (ADMIN)' });
  const { db, decisionCreates } = buildDecideDb(packet);

  const decided = await decideCommitteePacket(
    packet.id,
    { outcome: CommitteeDecisionOutcome.APPROVED, notes: 'Cleared', followUpActions: null },
    'Bob (ADMIN)',
    db
  );

  assert.equal(decided.status, CommitteePacketStatus.APPROVED);
  assert.equal(decisionCreates.length, 1);
  assert.equal(decisionCreates[0].decidedByLabel, 'Bob (ADMIN)');
});

test('SoD: the operator who decided a packet cannot release it', async () => {
  const packet = buildPacket({
    status: CommitteePacketStatus.APPROVED,
    preparedByLabel: 'Alice (ADMIN)',
    decisions: [
      {
        id: 'decision-1',
        packetId: 'packet-1',
        outcome: CommitteeDecisionOutcome.APPROVED,
        decidedAt: new Date('2026-04-15T03:00:00.000Z'),
        decidedByLabel: 'Bob (ADMIN)',
        notes: null,
        followUpActions: null,
        createdAt: new Date('2026-04-15T03:00:00.000Z'),
        updatedAt: new Date('2026-04-15T03:00:00.000Z')
      }
    ]
  });
  const { db } = buildReleaseDb(packet);

  await assert.rejects(
    () => releaseCommitteePacket(packet.id, 'Bob (ADMIN)', db),
    (error: unknown) => {
      assert.ok(error instanceof SegregationOfDutiesError);
      assert.match((error as Error).message, /recorded the committee decision cannot release/i);
      return true;
    }
  );
});

test('SoD: a distinct ADMIN can release a packet decided by someone else', async () => {
  const packet = buildPacket({
    status: CommitteePacketStatus.APPROVED,
    preparedByLabel: 'Alice (ADMIN)',
    decisions: [
      {
        id: 'decision-1',
        packetId: 'packet-1',
        outcome: CommitteeDecisionOutcome.APPROVED,
        decidedAt: new Date('2026-04-15T03:00:00.000Z'),
        decidedByLabel: 'Bob (ADMIN)',
        notes: null,
        followUpActions: null,
        createdAt: new Date('2026-04-15T03:00:00.000Z'),
        updatedAt: new Date('2026-04-15T03:00:00.000Z')
      }
    ]
  });
  const { db, packetUpdates } = buildReleaseDb(packet);

  const released = await releaseCommitteePacket(packet.id, 'Carol (ADMIN)', db);

  assert.equal(released.status, CommitteePacketStatus.RELEASED);
  assert.ok(released.releasedAt instanceof Date);
  // The locker identity (preparedByLabel) must be preserved through release.
  assert.equal(packetUpdates[0].preparedByLabel, undefined);
});

test('SoD: enforcement is skipped when prior-actor label is not persisted (null)', async () => {
  // Locker label null -> decide cannot be blocked.
  const lockedPacket = buildPacket({ preparedByLabel: null });
  const { db: decideDb } = buildDecideDb(lockedPacket);
  const decided = await decideCommitteePacket(
    lockedPacket.id,
    { outcome: CommitteeDecisionOutcome.APPROVED, notes: null, followUpActions: null },
    'Alice (ADMIN)',
    decideDb
  );
  assert.equal(decided.status, CommitteePacketStatus.APPROVED);

  // No decision label -> release cannot be blocked.
  const decidedPacket = buildPacket({
    status: CommitteePacketStatus.APPROVED,
    decisions: []
  });
  const { db: releaseDb } = buildReleaseDb(decidedPacket);
  const released = await releaseCommitteePacket(decidedPacket.id, 'Alice (ADMIN)', releaseDb);
  assert.equal(released.status, CommitteePacketStatus.RELEASED);
});
