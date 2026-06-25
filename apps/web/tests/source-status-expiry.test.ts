import assert from 'node:assert/strict';
import test from 'node:test';
import { listSourceStatus } from '@/lib/services/sources';

/**
 * listSourceStatus reports the freshest cache row per source system. A row whose
 * stored status is FRESH/MANUAL but whose expiresAt has passed is no longer
 * fresh data — the TTL (expiresAt) defines the freshness window. The reported
 * status must be re-evaluated against `now` so ops health does not under-report
 * sources that silently aged out of their cache window.
 */

const SYSTEM = 'global-fx-rates';

function fakeDb(rows: Array<Record<string, unknown>>) {
  return {
    sourceCache: {
      async findMany() {
        return rows;
      }
    }
  } as unknown as Parameters<typeof listSourceStatus>[0];
}

test('FRESH row past its expiresAt is reported STALE', async () => {
  const now = new Date();
  const db = fakeDb([
    {
      sourceSystem: SYSTEM,
      cacheKey: 'USD:KRW',
      status: 'FRESH',
      freshnessLabel: 'live fetch',
      fetchedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000) // expired an hour ago
    }
  ]);

  const rows = await listSourceStatus(db, now);
  const fx = rows.find((r) => r.sourceSystem === SYSTEM)!;
  assert.equal(fx.status, 'STALE');
  assert.equal(fx.freshnessLabel, 'expired (past TTL)');
});

test('FRESH row still within its expiresAt stays FRESH', async () => {
  const now = new Date();
  const db = fakeDb([
    {
      sourceSystem: SYSTEM,
      cacheKey: 'USD:KRW',
      status: 'FRESH',
      freshnessLabel: 'live fetch',
      fetchedAt: new Date(now.getTime() - 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000) // still valid for an hour
    }
  ]);

  const rows = await listSourceStatus(db, now);
  const fx = rows.find((r) => r.sourceSystem === SYSTEM)!;
  assert.equal(fx.status, 'FRESH');
  assert.equal(fx.freshnessLabel, 'live fetch');
});

test('expired FAILED row is left FAILED (only FRESH/MANUAL downgrade to STALE)', async () => {
  const now = new Date();
  const db = fakeDb([
    {
      sourceSystem: SYSTEM,
      cacheKey: 'USD:KRW',
      status: 'FAILED',
      freshnessLabel: 'fetch error',
      fetchedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000)
    }
  ]);

  const rows = await listSourceStatus(db, now);
  const fx = rows.find((r) => r.sourceSystem === SYSTEM)!;
  assert.equal(fx.status, 'FAILED');
});

test('never-queried system is NOT_QUERIED', async () => {
  const rows = await listSourceStatus(fakeDb([]), new Date());
  const fx = rows.find((r) => r.sourceSystem === SYSTEM)!;
  assert.equal(fx.status, 'NOT_QUERIED');
});
