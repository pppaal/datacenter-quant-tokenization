import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFreshness, freshnessTone } from '@/lib/services/im/freshness';

const NOW = new Date('2026-04-30T12:00:00Z');

test('classifyFreshness returns fresh when < 7 days', () => {
  const r = classifyFreshness(new Date('2026-04-25T12:00:00Z'), NOW);
  assert.equal(r.band, 'fresh');
  assert.equal(r.ageDays, 5);
  assert.equal(r.label, '5d ago');
});

test('classifyFreshness returns recent when 7–29 days', () => {
  const r = classifyFreshness(new Date('2026-04-10T12:00:00Z'), NOW);
  assert.equal(r.band, 'recent');
  assert.equal(r.ageDays, 20);
  assert.equal(r.label, '20d ago');
});

test('classifyFreshness returns stale when ≥ 30 days', () => {
  const r = classifyFreshness(new Date('2026-02-01T12:00:00Z'), NOW);
  assert.equal(r.band, 'stale');
  assert.ok(r.ageDays! >= 80);
  // 88 days → 2mo ago
  assert.ok(r.label.endsWith('mo ago'));
});

test('classifyFreshness handles "today" / "yesterday" labels', () => {
  assert.equal(classifyFreshness(NOW, NOW).label, 'today');
  assert.equal(classifyFreshness(new Date('2026-04-29T12:00:00Z'), NOW).label, 'yesterday');
});

test('classifyFreshness returns null band for missing or invalid input', () => {
  assert.equal(classifyFreshness(null, NOW).band, null);
  assert.equal(classifyFreshness(undefined, NOW).band, null);
  assert.equal(classifyFreshness('not-a-date', NOW).band, null);
});

test('classifyFreshness accepts string dates', () => {
  const r = classifyFreshness('2026-04-25T00:00:00Z', NOW);
  assert.equal(r.band, 'fresh');
});

test('freshnessTone maps band to UI tone', () => {
  assert.equal(freshnessTone('fresh'), 'good');
  assert.equal(freshnessTone('recent'), 'warn');
  assert.equal(freshnessTone('stale'), 'risk');
  assert.equal(freshnessTone(null), null);
});

test('classifyFreshness clamps future dates to ageDays 0', () => {
  const r = classifyFreshness(new Date('2027-01-01T00:00:00Z'), NOW);
  assert.equal(r.ageDays, 0);
});
