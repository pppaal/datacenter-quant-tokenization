import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceStatus } from '@prisma/client';
import {
  deriveResearchFreshness,
  describeResearchFreshness,
  getFreshnessTone
} from '@/lib/services/research/freshness';

test('deriveResearchFreshness flags missing coverage', () => {
  const r = deriveResearchFreshness(null);
  assert.equal(r.status, SourceStatus.FAILED);
  assert.equal(r.label, 'missing coverage');
  assert.equal(r.observedAt, null);
});

test('deriveResearchFreshness reports FRESH within 30 days', () => {
  const observed = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const r = deriveResearchFreshness(observed);
  assert.equal(r.status, SourceStatus.FRESH);
  assert.equal(r.label, '10d old');
});

test('deriveResearchFreshness reports STALE between 31 and 90 days', () => {
  const observed = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const r = deriveResearchFreshness(observed);
  assert.equal(r.status, SourceStatus.STALE);
});

test('deriveResearchFreshness reports FAILED beyond 90 days', () => {
  const observed = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const r = deriveResearchFreshness(observed);
  assert.equal(r.status, SourceStatus.FAILED);
});

test('deriveResearchFreshness clamps a future-dated observation to 0d (no negative age, stays FRESH)', () => {
  // Clock skew or a forward-stamped source must not surface a negative age
  // label, and must not slip past the freshness windows into STALE/FAILED.
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const r = deriveResearchFreshness(future);
  assert.equal(r.status, SourceStatus.FRESH);
  assert.equal(r.label, '0d old');
  assert.ok(!r.label.includes('-'), 'label must not contain a negative age');
});

test('describeResearchFreshness and getFreshnessTone map status to copy/tone', () => {
  assert.match(describeResearchFreshness(SourceStatus.FRESH, '3d old'), /current/);
  assert.equal(getFreshnessTone(SourceStatus.FRESH), 'good');
  assert.equal(getFreshnessTone(SourceStatus.STALE), 'warn');
  assert.equal(getFreshnessTone(SourceStatus.FAILED), 'danger');
  assert.equal(getFreshnessTone(null), 'danger');
});
