/**
 * Deterministic, DB-free tests for the audit-review query + aggregation layer.
 * A Prisma `auditEvent` fake captures the args passed to `findMany`/`count` so
 * we can assert on the resolved `where`/`take` without a database.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listAuditEvents,
  resolveSafeAuditLimit,
  summarizeAuditEvents,
  type SummarizableAuditEvent
} from '@/lib/services/audit-review';

type Captured = { findManyArgs: any; countArgs: any };

function makeAuditFake(rows: any[] = []): { db: any; captured: Captured } {
  const captured: Captured = { findManyArgs: null, countArgs: null };
  const db = {
    auditEvent: {
      async findMany(args: any) {
        captured.findManyArgs = args;
        return rows;
      },
      async count(args: any) {
        captured.countArgs = args;
        return rows.length;
      }
    }
  };
  return { db, captured };
}

function row(overrides: Partial<SummarizableAuditEvent> & { id?: string } = {}) {
  return {
    id: overrides.id ?? 'e1',
    actorIdentifier: overrides.actorIdentifier ?? 'analyst',
    actorRole: overrides.actorRole ?? 'ANALYST',
    action: 'x.create',
    entityType: overrides.entityType ?? 'deal',
    entityId: null,
    assetId: null,
    requestPath: null,
    requestMethod: null,
    ipAddress: null,
    statusLabel: overrides.statusLabel ?? 'SUCCESS',
    metadata: null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z')
  };
}

// ---------------------------------------------------------------------------
// Improvement 1: robust date-window filtering (invalid + transposed bounds).
// ---------------------------------------------------------------------------
test('listAuditEvents ignores an Invalid Date bound instead of forwarding it', async () => {
  const { db, captured } = makeAuditFake();
  await listAuditEvents({ startDate: new Date('not-a-date'), endDate: undefined }, db);
  // No createdAt clause should be present when the only bound is invalid.
  assert.equal(captured.findManyArgs.where.createdAt, undefined);
});

test('listAuditEvents keeps a valid date bound while dropping an invalid one', async () => {
  const { db, captured } = makeAuditFake();
  const valid = new Date('2026-03-01T00:00:00.000Z');
  await listAuditEvents({ startDate: valid, endDate: new Date('garbage') }, db);
  assert.deepEqual(captured.findManyArgs.where.createdAt, { gte: valid });
});

test('listAuditEvents normalizes transposed date bounds instead of returning an empty window', async () => {
  const { db, captured } = makeAuditFake();
  const later = new Date('2026-06-01T00:00:00.000Z');
  const earlier = new Date('2026-01-01T00:00:00.000Z');
  // startDate AFTER endDate: an impossible window if forwarded as-is.
  await listAuditEvents({ startDate: later, endDate: earlier }, db);
  assert.deepEqual(captured.findManyArgs.where.createdAt, { gte: earlier, lte: later });
});

// ---------------------------------------------------------------------------
// Improvement 2: page-size normalization guards NaN / fractional / negative.
// ---------------------------------------------------------------------------
test('resolveSafeAuditLimit normalizes NaN, fractional, negative, and oversized inputs', () => {
  assert.equal(resolveSafeAuditLimit(undefined), 25);
  assert.equal(resolveSafeAuditLimit(Number.NaN), 25);
  assert.equal(resolveSafeAuditLimit(2.9), 2); // floored, not 3.9 forwarded to Prisma
  assert.equal(resolveSafeAuditLimit(-5), 1);
  assert.equal(resolveSafeAuditLimit(0), 1);
  assert.equal(resolveSafeAuditLimit(10_000), 100);
  assert.equal(resolveSafeAuditLimit(40), 40);
});

test('listAuditEvents forwards an integer take even for a fractional limit', async () => {
  const { db, captured } = makeAuditFake();
  await listAuditEvents({ limit: 2.9 }, db);
  // take = safeLimit + 1; must be an integer (Prisma rejects fractional take).
  assert.equal(captured.findManyArgs.take, 3);
  assert.ok(Number.isInteger(captured.findManyArgs.take));
});

// ---------------------------------------------------------------------------
// Improvement 3: failure-rate / status partition reconciliation.
// ---------------------------------------------------------------------------
test('summarizeAuditEvents returns 0 failureRate on an empty set (no divide-by-zero)', () => {
  const s = summarizeAuditEvents([]);
  assert.equal(s.totalCount, 0);
  assert.equal(s.failureRate, 0);
  assert.ok(!Number.isNaN(s.failureRate));
  assert.equal(s.lastEventAt, null);
  assert.deepEqual(s.actors, []);
  assert.deepEqual(s.entityTypes, []);
});

test('summarizeAuditEvents partitions statuses so success+failure+other reconciles', () => {
  const s = summarizeAuditEvents([
    row({ statusLabel: 'SUCCESS' }),
    row({ statusLabel: 'FAILED' }),
    row({ statusLabel: 'FAILED' }),
    row({ statusLabel: 'RUNNING' }) // neither success nor failure
  ]);
  assert.equal(s.totalCount, 4);
  assert.equal(s.successCount, 1);
  assert.equal(s.failureCount, 2);
  assert.equal(s.otherCount, 1);
  assert.equal(s.successCount + s.failureCount + s.otherCount, s.totalCount);
  assert.equal(s.failureRate, 0.5);
});

test('summarizeAuditEvents classifies status case-insensitively', () => {
  const s = summarizeAuditEvents([
    row({ statusLabel: 'failed' }),
    row({ statusLabel: ' success ' })
  ]);
  assert.equal(s.failureCount, 1);
  assert.equal(s.successCount, 1);
  assert.equal(s.otherCount, 0);
});

// ---------------------------------------------------------------------------
// Improvement 4: actor dedup, lastSeenAt from createdAt, entity grouping,
// stable ordering regardless of input order.
// ---------------------------------------------------------------------------
test('summarizeAuditEvents dedups actors on identifier+role and tracks per-actor failures', () => {
  const s = summarizeAuditEvents([
    row({ actorIdentifier: 'a', actorRole: 'ADMIN', statusLabel: 'SUCCESS' }),
    row({ actorIdentifier: 'a', actorRole: 'ADMIN', statusLabel: 'FAILED' }),
    // Same identifier, different role -> a distinct actor entry.
    row({ actorIdentifier: 'a', actorRole: 'ANALYST', statusLabel: 'SUCCESS' })
  ]);
  assert.equal(s.distinctActorCount, 2);
  const adminActor = s.actors.find((x) => x.actorRole === 'ADMIN')!;
  assert.equal(adminActor.eventCount, 2);
  assert.equal(adminActor.failureCount, 1);
});

test('summarizeAuditEvents derives lastSeenAt/lastEventAt from the newest createdAt regardless of input order', () => {
  const older = new Date('2026-01-01T00:00:00.000Z');
  const newer = new Date('2026-06-01T00:00:00.000Z');
  // Newest event delivered FIRST to prove it is not just "last row wins".
  const s = summarizeAuditEvents([
    row({ actorIdentifier: 'a', createdAt: newer }),
    row({ actorIdentifier: 'a', createdAt: older })
  ]);
  assert.equal(s.lastEventAt?.getTime(), newer.getTime());
  assert.equal(s.actors[0].lastSeenAt.getTime(), newer.getTime());
});

test('summarizeAuditEvents groups entity types with reconciling counts and stable order', () => {
  const s = summarizeAuditEvents([
    row({ entityType: 'deal' }),
    row({ entityType: 'valuation' }),
    row({ entityType: 'deal' }),
    row({ entityType: 'deal' })
  ]);
  assert.equal(s.distinctEntityTypeCount, 2);
  const totalByType = s.entityTypes.reduce((sum, t) => sum + t.eventCount, 0);
  assert.equal(totalByType, s.totalCount);
  // Highest-count entity type first (stable, count desc).
  assert.equal(s.entityTypes[0].entityType, 'deal');
  assert.equal(s.entityTypes[0].eventCount, 3);
});

test('summarizeAuditEvents actor ordering is deterministic for equal last-seen times (tie-broken)', () => {
  const ts = new Date('2026-02-02T00:00:00.000Z');
  const forward = summarizeAuditEvents([
    row({ actorIdentifier: 'bob', createdAt: ts }),
    row({ actorIdentifier: 'amy', createdAt: ts })
  ]);
  const reversed = summarizeAuditEvents([
    row({ actorIdentifier: 'amy', createdAt: ts }),
    row({ actorIdentifier: 'bob', createdAt: ts })
  ]);
  // Same tie-broken ordering regardless of input order.
  assert.deepEqual(
    forward.actors.map((a) => a.actorIdentifier),
    reversed.actors.map((a) => a.actorIdentifier)
  );
  assert.equal(forward.actors[0].actorIdentifier, 'amy');
});
