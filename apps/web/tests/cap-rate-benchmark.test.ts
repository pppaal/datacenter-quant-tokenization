import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCapRateBenchmark } from '@/lib/services/research/cap-rate-benchmark';
import type { CapRateBucket } from '@/lib/services/research/cap-rate-aggregator';

const ASOF = new Date('2026-06-30');
const recent = new Date('2026-03-01');
const stale = new Date('2024-01-01');

function bucket(
  p: Partial<CapRateBucket> & Pick<CapRateBucket, 'market' | 'medianPct' | 'count'>
): CapRateBucket {
  return {
    region: null,
    assetClass: null,
    assetTier: null,
    minPct: p.medianPct - 0.5,
    maxPct: p.medianPct + 0.5,
    latestObservedAt: recent,
    ...p
  };
}

test('exact market-class-tier match preferred; transactions + indicators → blended/high', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        assetTier: 'Prime',
        medianPct: 4.6,
        count: 6
      })
    ],
    fromIndicators: [
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        assetTier: 'Prime',
        medianPct: 4.8,
        count: 4
      })
    ],
    target: { market: 'Seoul', assetClass: 'OFFICE', assetTier: 'Prime' },
    asOf: ASOF
  });
  assert.equal(r.matchLevel, 'market-class-tier');
  assert.equal(r.source, 'blended');
  assert.equal(r.sampleCount, 10);
  // count-weighted: (4.6*6 + 4.8*4)/10 = 4.68
  assert.equal(r.medianPct, 4.68);
  assert.equal(r.confidence, 'high'); // has txn, >=5, fresh
});

test('relaxes to market-class when no tier match exists', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        assetTier: 'Grade B',
        medianPct: 5.8,
        count: 4
      })
    ],
    fromIndicators: [],
    target: { market: 'Seoul', assetClass: 'OFFICE', assetTier: 'Prime' },
    asOf: ASOF
  });
  // No Prime bucket → relax to market-class (still OFFICE in Seoul).
  assert.equal(r.matchLevel, 'market-class');
  assert.equal(r.source, 'transactions');
  assert.equal(r.medianPct, 5.8);
  assert.equal(r.confidence, 'medium'); // 4 obs, fresh, but relaxed match
});

test('relaxes to market when no class match; region filter is respected', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [],
    fromIndicators: [
      bucket({
        market: 'Busan',
        region: 'Haeundae',
        assetClass: 'RETAIL',
        medianPct: 6.0,
        count: 3
      }),
      bucket({
        market: 'Busan',
        region: 'Seomyeon',
        assetClass: 'RETAIL',
        medianPct: 7.0,
        count: 2
      })
    ],
    target: { market: 'Busan', region: 'Haeundae', assetClass: 'DATA_CENTER' },
    asOf: ASOF
  });
  // No DATA_CENTER → relax to market, but region 'Haeundae' must still match.
  assert.equal(r.matchLevel, 'market');
  assert.equal(r.source, 'indicators');
  assert.equal(r.sampleCount, 3); // only the Haeundae bucket
  assert.equal(r.medianPct, 6.0);
  assert.equal(r.confidence, 'medium'); // indicators only, 3 obs
});

test('no match → none', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [bucket({ market: 'Seoul', medianPct: 4.5, count: 5 })],
    fromIndicators: [],
    target: { market: 'Incheon' },
    asOf: ASOF
  });
  assert.equal(r.matchLevel, 'none');
  assert.equal(r.confidence, 'none');
  assert.equal(r.medianPct, null);
  assert.equal(r.sampleCount, 0);
});

test('stale comps are flagged and cannot reach high confidence', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        medianPct: 5.0,
        count: 8,
        latestObservedAt: stale
      })
    ],
    fromIndicators: [],
    target: { market: 'Seoul', assetClass: 'OFFICE' },
    asOf: ASOF
  });
  assert.ok(r.staleMonths != null && r.staleMonths > 18);
  assert.equal(r.confidence, 'low'); // 8 obs but stale → not high/medium
  assert.ok(r.notes.some((n) => n.includes('stale')));
});

test('count-weighted blend across multiple market-class buckets', () => {
  const r = selectCapRateBenchmark({
    fromTransactions: [
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        assetTier: 'Prime',
        medianPct: 4.0,
        count: 1
      }),
      bucket({
        market: 'Seoul',
        assetClass: 'OFFICE',
        assetTier: 'Grade A',
        medianPct: 6.0,
        count: 3
      })
    ],
    fromIndicators: [],
    target: { market: 'Seoul', assetClass: 'OFFICE' },
    asOf: ASOF
  });
  assert.equal(r.matchLevel, 'market-class');
  // (4.0*1 + 6.0*3)/4 = 5.5
  assert.equal(r.medianPct, 5.5);
  assert.equal(r.minPct, 3.5); // min of mins (4.0-0.5)
  assert.equal(r.maxPct, 6.5); // max of maxes (6.0+0.5)
});
