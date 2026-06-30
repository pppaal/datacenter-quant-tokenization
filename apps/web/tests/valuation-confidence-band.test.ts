import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildValuationConfidenceBand,
  type ComparableLike,
  type CoverageLike
} from '@/lib/services/valuation/valuation-confidence-band';

const BASE = 100_000_000_000; // 100B KRW
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const comps = (rates: number[]): ComparableLike[] => rates.map((capRatePct) => ({ capRatePct }));
const coverage = (good: number, warn: number): CoverageLike => ({
  coverage: [
    ...Array.from({ length: good }, () => ({ status: 'good' as const })),
    ...Array.from({ length: warn }, () => ({ status: 'warn' as const }))
  ]
});

test('robust comps + full coverage → high confidence, band at the floor', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: BASE,
    comparables: comps([5.0, 5.1, 4.9, 5.0, 5.0]),
    quality: coverage(6, 0)
  });
  assert.equal(r.comparableCount, 5);
  assert.equal(r.comparableQuality, 'robust');
  assert.ok(r.comparableDispersionCv != null && r.comparableDispersionCv < 0.05);
  assert.equal(r.confidenceLabel, 'high');
  assert.ok(near(r.bandHalfWidthPct, 0.05)); // tight CV → floored at ±5%
  assert.equal(r.lowValueKrw, 95_000_000_000);
  assert.equal(r.highValueKrw, 105_000_000_000);
  assert.equal(r.coverageWarnCount, 0);
  assert.equal(r.coverageTotal, 6);
});

test('single comp → sparse, low confidence, dispersion unmeasurable, widened band', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: BASE,
    comparables: comps([5.0])
  });
  assert.equal(r.comparableQuality, 'sparse');
  assert.equal(r.comparableDispersionCv, null);
  assert.equal(r.confidenceLabel, 'low');
  // default dispersion 0.20 + sparse-comp penalty 0.05 = 0.25
  assert.ok(near(r.bandHalfWidthPct, 0.25));
  assert.equal(r.lowValueKrw, 75_000_000_000);
  assert.equal(r.coverageWarnCount, null);
});

test('wide cap-rate dispersion → fair, band capped at the dispersion ceiling', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: BASE,
    comparables: comps([4, 6, 8, 10]) // CV ≈ 0.37
  });
  assert.equal(r.comparableCount, 4);
  assert.equal(r.comparableQuality, 'fair'); // >=3 comps but CV > 0.10
  assert.ok(r.comparableDispersionCv != null && r.comparableDispersionCv > 0.3);
  assert.ok(near(r.bandHalfWidthPct, 0.3)); // dispersion component capped at 0.30
  assert.equal(r.confidenceLabel, 'medium');
});

test('robust comps but thin evidence coverage downgrades confidence to low', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: BASE,
    comparables: comps([5.0, 5.1, 4.9, 5.0, 5.0]),
    quality: coverage(1, 5) // 5/6 warn → thin
  });
  assert.equal(r.comparableQuality, 'robust');
  assert.equal(r.confidenceLabel, 'low'); // coverage thin overrides
  // floor 0.05 + coverage penalty (5/6 * 0.15 = 0.125) = 0.175
  assert.ok(near(r.bandHalfWidthPct, 0.175));
});

test('exactly 3 comps with moderate dispersion → fair, no sparse-count penalty', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: BASE,
    comparables: comps([5.0, 5.5, 6.0]),
    quality: coverage(4, 2)
  });
  assert.equal(r.comparableQuality, 'fair');
  assert.equal(r.confidenceLabel, 'medium');
  // no count penalty (>=3 comps); band = dispersion + coverage(2/6*0.15=0.05)
  assert.ok(r.bandHalfWidthPct >= 0.05 && r.bandHalfWidthPct <= 0.35);
});

test('zero base value is guarded (band still classifies, values stay 0)', () => {
  const r = buildValuationConfidenceBand({
    baseValueKrw: 0,
    comparables: comps([5.0, 5.0, 5.0])
  });
  assert.equal(r.lowValueKrw, 0);
  assert.equal(r.highValueKrw, 0);
  assert.equal(r.comparableQuality, 'fair');
});
