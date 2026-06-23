/**
 * Deterministic, DB-free tests for the audit-review query + aggregation layer.
 * A Prisma `auditEvent` fake captures the args passed to `findMany`/`count` so
 * we can assert on the resolved `where`/`take` without a database.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { listAuditEvents } from '@/lib/services/audit-review';

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
