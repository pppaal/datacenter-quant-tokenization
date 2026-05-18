import assert from 'node:assert/strict';
import test from 'node:test';
import { runMonteCarlo } from '@/lib/services/valuation/monte-carlo';
import type { ProFormaInputs } from '@/lib/services/valuation/synthetic-pro-forma';

function baseInputs(): ProFormaInputs {
  const purchase = 100_000_000_000; // 100B KRW
  const capRatePct = 5.0;
  return {
    purchasePriceKrw: purchase,
    ltvPct: 55,
    interestRatePct: 4.5,
    amortTermMonths: 360,
    capRatePct,
    exitCapRatePct: 5.5,
    year1Noi: Math.round((purchase * capRatePct) / 100),
    growthPct: 2.5,
    opexRatio: 0.3,
    propertyTaxPct: 0.3,
    insurancePct: 0.1,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct: 70,
    depreciationYears: 40,
    exitCostPct: 2.0,
    propertyTaxGrowthPct: 2.0,
    capexReservePct: 2.0
  };
}

test('monte-carlo emits tail metrics on every distribution', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 500, seed: 7 });

  for (const dist of [r.leveredIrr, r.unleveredIrr, r.moic]) {
    assert.ok(dist.tail, 'tail object should exist');
    assert.equal(dist.tail.sampleCount, r.validIterations, 'sample count matches valid iterations');
  }

  // IRR distributions use 0% as downside target.
  assert.equal(r.leveredIrr.tail.downsideTarget, 0);
  // MOIC distribution uses 1.0x as downside target.
  assert.equal(r.moic.tail.downsideTarget, 1.0);
});

test('CVaR ≤ VaR (expected shortfall is no better than the percentile cut)', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 800, seed: 11 });
  const t = r.leveredIrr.tail;

  if (t.expectedShortfall95 !== null && t.p5 !== null) {
    assert.ok(
      t.expectedShortfall95 <= t.p5 + 1e-9,
      `ES95 (${t.expectedShortfall95}) should be ≤ P5 (${t.p5})`
    );
  }
  if (t.expectedShortfall99 !== null && t.p1 !== null) {
    assert.ok(
      t.expectedShortfall99 <= t.p1 + 1e-9,
      `ES99 (${t.expectedShortfall99}) should be ≤ P1 (${t.p1})`
    );
  }
});

test('tail percentiles are monotone: p1 ≤ p5 ≤ p10 ≤ p50 ≤ p90 ≤ p95 ≤ p99', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 800, seed: 13 });
  const d = r.leveredIrr;
  const t = d.tail;
  // Skip if tails couldn't be computed (insufficient samples).
  if (t.p1 === null || t.p5 === null || t.p95 === null || t.p99 === null) return;
  assert.ok(t.p1 <= t.p5);
  assert.ok(t.p5 <= d.p10!);
  assert.ok(d.p10! <= d.p50!);
  assert.ok(d.p50! <= d.p90!);
  assert.ok(d.p90! <= t.p95);
  assert.ok(t.p95 <= t.p99);
});

test('worstObserved equals min of distribution', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 400, seed: 17 });
  assert.equal(r.leveredIrr.tail.worstObserved, r.leveredIrr.min);
});

test('downside deviation is non-negative when present', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 600, seed: 19 });
  for (const dist of [r.leveredIrr, r.unleveredIrr, r.moic]) {
    if (dist.tail.downsideDeviation !== null) {
      assert.ok(dist.tail.downsideDeviation >= 0);
    }
  }
});
