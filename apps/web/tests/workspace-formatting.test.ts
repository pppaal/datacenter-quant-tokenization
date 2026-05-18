import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeThesisAgeDays,
  countProvenance,
  extractSnapshotHighlights,
  flattenNumericMetrics,
  formatOfficialMetricValue,
  inferApprovalStatus,
  inferObservationDateFromPayload,
  inferSnapshotViewType,
  pluralize
} from '@/lib/services/research/workspace-formatting';

test('pluralize handles singular vs plural', () => {
  assert.equal(pluralize(1, 'asset'), '1 asset');
  assert.equal(pluralize(0, 'asset'), '0 assets');
  assert.equal(pluralize(7, 'asset'), '7 assets');
});

test('formatOfficialMetricValue formats by unit', () => {
  assert.equal(formatOfficialMetricValue({ value: 5.234, unit: 'pct' }), '5.2%');
  assert.equal(formatOfficialMetricValue({ value: 215, unit: 'bps' }), '215 bps');
  assert.equal(formatOfficialMetricValue({ value: 12345.6, unit: 'sqm' }), '12,346 sqm');
  assert.equal(formatOfficialMetricValue({ value: 9_500_000, unit: 'krw_per_sqm' }), '9,500,000 KRW/sqm');
  assert.equal(formatOfficialMetricValue({ value: 4.2, unit: 'kwh_per_sqm' }), '4.2 kWh/sqm');
  assert.equal(formatOfficialMetricValue({ value: 100, unit: 'count' }), '100');
  assert.equal(formatOfficialMetricValue({ value: 100.5, unit: 'count' }), '100.5');
});

test('countProvenance returns array length or 0', () => {
  assert.equal(countProvenance([1, 2, 3]), 3);
  assert.equal(countProvenance([]), 0);
  assert.equal(countProvenance(null), 0);
  assert.equal(countProvenance({ a: 1 }), 0);
});

test('extractSnapshotHighlights handles missing or malformed input', () => {
  assert.deepEqual(extractSnapshotHighlights(null), []);
  assert.deepEqual(extractSnapshotHighlights({}), []);
  assert.deepEqual(extractSnapshotHighlights({ highlights: 'not-array' }), []);
  assert.deepEqual(
    extractSnapshotHighlights({
      highlights: [
        { label: 'A', value: '1' },
        { label: 'B' }, // missing value
        { value: '2' }, // missing label
        null,
        { label: 'C', value: '3' }
      ]
    }),
    [
      { label: 'A', value: '1' },
      { label: 'C', value: '3' }
    ]
  );
});

test('flattenNumericMetrics walks nested objects up to depth 2 and 32 entries', () => {
  const out = flattenNumericMetrics({
    a: 1,
    b: { c: 2, d: { e: 3, f: 'skip' } },
    g: [1, 2] // arrays skipped
  });
  const keys = out.map((row) => row.key);
  assert.ok(keys.includes('a'));
  assert.ok(keys.includes('b.c'));
  assert.ok(keys.includes('b.d.e'));
  assert.ok(!keys.includes('b.d.f')); // string skipped
  assert.ok(!keys.some((k) => k.startsWith('g')));
});

test('flattenNumericMetrics caps recursion when bucket reaches 32', () => {
  // Cap path triggers between iterations of the outer loop, so build a
  // structure that requires recursing into nested objects to keep adding
  // — the 32-entry break stops the recursion.
  const nested: Record<string, unknown> = {};
  for (let i = 0; i < 50; i += 1) {
    nested[`g${i}`] = { value: i };
  }
  const out = flattenNumericMetrics(nested);
  assert.ok(out.length <= 32 + 1); // 32 cap + 1 in-flight push grace
  assert.ok(out.length >= 32);
});

test('inferObservationDateFromPayload prefers known date fields', () => {
  const fallback = new Date('2026-01-01T00:00:00Z');
  const date = inferObservationDateFromPayload(
    { observationDate: '2026-04-15T00:00:00Z' },
    fallback
  );
  assert.equal(date.toISOString(), '2026-04-15T00:00:00.000Z');

  const date2 = inferObservationDateFromPayload(
    { foo: 'bar', asOfDate: '2026-03-01' },
    fallback
  );
  assert.equal(date2.toISOString(), '2026-03-01T00:00:00.000Z');

  const date3 = inferObservationDateFromPayload({ foo: 'bar' }, fallback);
  assert.equal(date3.getTime(), fallback.getTime());
});

test('inferSnapshotViewType maps snapshotType to SOURCE/HOUSE', () => {
  assert.equal(inferSnapshotViewType({ viewType: 'SOURCE' }), 'SOURCE');
  assert.equal(inferSnapshotViewType({ snapshotType: 'official-source' }), 'SOURCE');
  assert.equal(inferSnapshotViewType({ snapshotType: 'market-official-source' }), 'SOURCE');
  assert.equal(inferSnapshotViewType({ snapshotType: 'house-thesis' }), 'HOUSE');
  assert.equal(inferSnapshotViewType({}), 'HOUSE');
});

test('inferApprovalStatus prefers explicit value, otherwise derives from view type', () => {
  assert.equal(inferApprovalStatus({ approvalStatus: 'SUPERSEDED' }), 'SUPERSEDED');
  assert.equal(
    inferApprovalStatus({ snapshotType: 'official-source' }),
    'APPROVED'
  );
  assert.equal(inferApprovalStatus({ snapshotType: 'house' }), 'DRAFT');
});

test('computeThesisAgeDays returns null for non-Date input', () => {
  assert.equal(computeThesisAgeDays(null), null);
  assert.equal(computeThesisAgeDays(undefined), null);
});

test('computeThesisAgeDays returns 0 or positive integer for valid dates', () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const value = computeThesisAgeDays(yesterday);
  assert.ok(value !== null);
  assert.ok(value >= 0);
  assert.ok(value <= 2); // allow rounding around boundary
});
