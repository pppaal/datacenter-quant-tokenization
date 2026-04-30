import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { __testing } from '@/lib/services/research/cap-rate-aggregator';

const { median, rollup, bucketKey } = __testing;

test('median returns the middle of an odd-length list', () => {
  assert.equal(median([5]), 5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4, 5]), 3);
});

test('median averages the two middle values for an even-length list', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([10, 20]), 15);
});

test('median returns 0 for an empty list', () => {
  assert.equal(median([]), 0);
});

test('bucketKey distinguishes by every grouping field', () => {
  const a = bucketKey({ market: 'KR', region: 'YEOUIDO', assetClass: 'OFFICE' as AssetClass, assetTier: 'PRIME' });
  const b = bucketKey({ market: 'KR', region: 'YEOUIDO', assetClass: 'OFFICE' as AssetClass, assetTier: 'GRADE_A' });
  const c = bucketKey({ market: 'KR', region: 'GANGNAM', assetClass: 'OFFICE' as AssetClass, assetTier: 'PRIME' });
  const d = bucketKey({ market: 'JP', region: 'YEOUIDO', assetClass: 'OFFICE' as AssetClass, assetTier: 'PRIME' });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('bucketKey treats null and empty as the same untiered bucket', () => {
  const a = bucketKey({ market: 'KR', region: null, assetClass: null, assetTier: null });
  const b = bucketKey({ market: 'KR', region: null, assetClass: null, assetTier: null });
  assert.equal(a, b);
});

test('rollup groups by all four fields and computes min/median/max', () => {
  const rows = [
    {
      market: 'KR',
      region: 'YEOUIDO',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'PRIME',
      capRate: 4.6,
      observedAt: new Date('2026-04-01')
    },
    {
      market: 'KR',
      region: 'YEOUIDO',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'PRIME',
      capRate: 4.8,
      observedAt: new Date('2026-04-15')
    },
    {
      market: 'KR',
      region: 'YEOUIDO',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'GRADE_A',
      capRate: 5.2,
      observedAt: null
    }
  ];
  const buckets = rollup(rows);
  assert.equal(buckets.length, 2);
  const prime = buckets.find((b) => b.assetTier === 'PRIME')!;
  const gradeA = buckets.find((b) => b.assetTier === 'GRADE_A')!;
  assert.equal(prime.count, 2);
  assert.equal(prime.minPct, 4.6);
  assert.equal(prime.maxPct, 4.8);
  assert.ok(Math.abs(prime.medianPct - 4.7) < 1e-9);
  assert.equal(prime.latestObservedAt?.toISOString(), new Date('2026-04-15').toISOString());
  assert.equal(gradeA.count, 1);
  assert.equal(gradeA.medianPct, 5.2);
  assert.equal(gradeA.latestObservedAt, null);
});

test('rollup sorts buckets stably by market, region, class, tier', () => {
  const rows = [
    {
      market: 'KR',
      region: 'GANGNAM',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'PRIME',
      capRate: 4.9,
      observedAt: null
    },
    {
      market: 'KR',
      region: 'YEOUIDO',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'GRADE_A',
      capRate: 5.4,
      observedAt: null
    },
    {
      market: 'JP',
      region: 'OTEMACHI',
      assetClass: 'OFFICE' as AssetClass,
      assetTier: 'PRIME',
      capRate: 3.2,
      observedAt: null
    }
  ];
  const buckets = rollup(rows);
  assert.deepEqual(
    buckets.map((b) => `${b.market}/${b.region}/${b.assetTier}`),
    ['JP/OTEMACHI/PRIME', 'KR/GANGNAM/PRIME', 'KR/YEOUIDO/GRADE_A']
  );
});
