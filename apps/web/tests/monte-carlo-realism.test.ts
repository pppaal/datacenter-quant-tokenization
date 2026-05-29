/**
 * Monte Carlo realism tests.
 *
 * Covers the stochastic-realism upgrades to monte-carlo.ts:
 *   (a) realized correlation matrix of the drawn drivers ≈ the target,
 *   (b) cap-rate draws are right-skewed (skewness > 0) and stay positive with
 *       NO pile-up at a clamp (soft bound),
 *   (c) antithetic pairing: paired-draw mean ≈ base, and the variance of the
 *       IRR mean estimate is materially lower WITH antithetic than without,
 *   (d) the DETERMINISTIC base case is unchanged (pinned).
 *
 * All seeded + offline; no DB / network.
 */
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

function variance(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}

// ---------------------------------------------------------------------------
// (d) Deterministic base case is PINNED — must never move when stochastic
// draws change. These numbers are the headline point estimate other code
// equates to "MC base == headline IRR".
// ---------------------------------------------------------------------------
test('deterministic base case is unchanged (pinned)', () => {
  // Base case is independent of seed / iterations / antithetic — verify across
  // several configurations that it is identical.
  const configs = [
    { iterations: 200, seed: 7 },
    { iterations: 1000, seed: 42 },
    { iterations: 500, seed: 99, antithetic: false }
  ];
  for (const cfg of configs) {
    const r = runMonteCarlo(baseInputs(), cfg);
    assert.equal(r.baseLeveredIrr, 5.1319, 'levered base IRR pinned');
    assert.equal(r.baseUnleveredIrr, 6.1392, 'unlevered base IRR pinned');
    assert.equal(r.baseMoic, 1.6, 'base MOIC pinned');
  }
});

// ---------------------------------------------------------------------------
// (a) Realized correlation ≈ target correlation.
// ---------------------------------------------------------------------------
test('realized correlation of drawn drivers tracks the target matrix', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 6000, seed: 7 });
  const target = r.correlationMatrix;
  const realized = r.realizedCorrelation;

  assert.equal(realized.length, target.length, 'square realized matrix');
  // Diagonal is exactly 1.
  for (let i = 0; i < target.length; i++) {
    assert.equal(realized[i]![i], 1, `diag ${i} == 1`);
  }
  // Off-diagonals within tolerance. The Gaussian-copula + lognormal marginals
  // attenuate Pearson correlation slightly vs the latent normal target, so we
  // allow 0.08 absolute tolerance at 6k samples.
  for (let i = 0; i < target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (i === j) continue;
      const diff = Math.abs(realized[i]![j]! - target[i]![j]!);
      assert.ok(
        diff <= 0.08,
        `corr[${i}][${j}] realized ${realized[i]![j]} vs target ${target[i]![j]} (Δ=${diff.toFixed(3)})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// (b) Cap-rate draws: right-skewed, strictly positive, no clamp pile-up.
// ---------------------------------------------------------------------------
test('entry cap-rate draws are right-skewed and strictly positive (soft bound)', () => {
  const r = runMonteCarlo(baseInputs(), {
    iterations: 6000,
    seed: 13,
    collectDriverDraws: true
  });

  const entryIdx = r.driverOrder.indexOf('Entry Cap Rate');
  assert.ok(entryIdx >= 0, 'entry cap rate driver present');
  const draws = r.driverDraws![entryIdx]!;
  assert.equal(draws.length, 6000, 'all draws collected');

  // Sample skewness > 0 (right skew). Reported on the summary too.
  assert.ok(
    r.drivers[entryIdx]!.skewness > 0,
    `entry cap skewness should be > 0 (got ${r.drivers[entryIdx]!.skewness})`
  );

  // All strictly positive (lognormal — no negative or zero cap rates).
  assert.ok(Math.min(...draws) > 0, 'all cap-rate draws strictly positive');

  // Median ≈ base (lognormal median == base by construction).
  const sorted = [...draws].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  assert.ok(Math.abs(median - 5.0) < 0.15, `median ${median} ≈ base 5.0`);

  // Mean > median (right skew signature for a positive distribution).
  const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
  assert.ok(mean > median, `mean ${mean} > median ${median} (right skew)`);

  // No clamp pile-up: a hard clamp would dump many draws exactly on the bound.
  // With a soft bound, no single value should account for a meaningful mass,
  // and the max should sit strictly below the model domain ceiling (20).
  const maxDraw = Math.max(...draws);
  assert.ok(maxDraw < 20, `max draw ${maxDraw} below domain ceiling`);
  // Count draws clustered in the top 0.5% of the value range — a clamp would
  // pile a fat spike at the very top; a lognormal tail thins out smoothly.
  const lo = Math.min(...draws);
  const topThreshold = maxDraw - (maxDraw - lo) * 0.005;
  const pileUp = draws.filter((v) => v >= topThreshold).length;
  assert.ok(
    pileUp < draws.length * 0.01,
    `no pile-up at the upper edge (got ${pileUp}/${draws.length})`
  );
});

test('interest-rate draws are right-skewed and strictly positive', () => {
  const r = runMonteCarlo(baseInputs(), {
    iterations: 6000,
    seed: 21,
    collectDriverDraws: true
  });
  const idx = r.driverOrder.indexOf('Interest Rate');
  const draws = r.driverDraws![idx]!;
  assert.ok(
    r.drivers[idx]!.skewness > 0,
    `interest skewness > 0 (got ${r.drivers[idx]!.skewness})`
  );
  assert.ok(Math.min(...draws) > 0, 'all interest-rate draws strictly positive');
});

test('rent-growth draws stay roughly symmetric (near-zero skew)', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 6000, seed: 23 });
  const idx = r.driverOrder.indexOf('Rent Growth');
  // Symmetric normal driver: |skew| should be small.
  assert.ok(
    Math.abs(r.drivers[idx]!.skewness) < 0.3,
    `rent growth near-symmetric (skew ${r.drivers[idx]!.skewness})`
  );
});

// ---------------------------------------------------------------------------
// (c) Antithetic variates.
// ---------------------------------------------------------------------------
test('antithetic pairing keeps driver means centred on base', () => {
  // With antithetic on, every z is paired with −z, so the drawn standard
  // normals sum to ~0 → symmetric drivers stay centred on base and lognormal
  // drivers stay centred on (just above) their median/base.
  const r = runMonteCarlo(baseInputs(), { iterations: 4000, seed: 31 });

  const growth = r.drivers[r.driverOrder.indexOf('Rent Growth')]!;
  assert.ok(Math.abs(growth.meanDrawnPct - 2.5) < 0.05, `growth mean ${growth.meanDrawnPct} ≈ 2.5`);

  const occ = r.drivers[r.driverOrder.indexOf('Occupancy')]!;
  assert.ok(Math.abs(occ.meanDrawnPct - 100) < 0.2, `occupancy mean ${occ.meanDrawnPct} ≈ 100`);

  const opex = r.drivers[r.driverOrder.indexOf('Opex Ratio')]!;
  assert.ok(
    Math.abs(opex.meanDrawnPct - 30) < 0.1,
    `opex mean ${opex.meanDrawnPct} ≈ 30 (0.30 ratio)`
  );

  // Lognormal drivers: mean sits just above the base (median), not below it.
  const entry = r.drivers[r.driverOrder.indexOf('Entry Cap Rate')]!;
  assert.ok(Math.abs(entry.meanDrawnPct - 5.0) < 0.1, `entry cap mean ${entry.meanDrawnPct} ≈ 5.0`);
});

test('antithetic variates lower the variance of the IRR mean estimate', () => {
  // Repeat the run across many seeds with and without antithetic and compare
  // the variance of the levered-IRR mean estimator. Antithetic should be
  // materially lower because the IRR response is near-monotone in the drivers.
  const SEEDS = 40;
  const ITER = 200;
  const anti: number[] = [];
  const plain: number[] = [];
  for (let s = 0; s < SEEDS; s++) {
    const a = runMonteCarlo(baseInputs(), { iterations: ITER, seed: 5000 + s, antithetic: true });
    const p = runMonteCarlo(baseInputs(), { iterations: ITER, seed: 5000 + s, antithetic: false });
    anti.push(a.leveredIrr.mean!);
    plain.push(p.leveredIrr.mean!);
  }
  const vAnti = variance(anti);
  const vPlain = variance(plain);
  assert.ok(
    vAnti < vPlain,
    `antithetic variance ${vAnti.toExponential(3)} should be < plain ${vPlain.toExponential(3)}`
  );
  // Expect a substantial reduction (not merely epsilon). Require ≥ 2× tighter.
  assert.ok(
    vAnti * 2 < vPlain,
    `antithetic should at least halve the estimator variance (anti=${vAnti.toExponential(3)}, plain=${vPlain.toExponential(3)})`
  );
});

// ---------------------------------------------------------------------------
// Determinism: same seed → identical results.
// ---------------------------------------------------------------------------
test('runs are deterministic for a fixed seed', () => {
  const a = runMonteCarlo(baseInputs(), { iterations: 800, seed: 77 });
  const b = runMonteCarlo(baseInputs(), { iterations: 800, seed: 77 });
  assert.deepEqual(a.leveredIrr, b.leveredIrr);
  assert.deepEqual(a.realizedCorrelation, b.realizedCorrelation);
  assert.deepEqual(a.drivers, b.drivers);
});

// ---------------------------------------------------------------------------
// New drivers are wired into the surface area.
// ---------------------------------------------------------------------------
test('occupancy and opex ratio appear as stochastic drivers', () => {
  const r = runMonteCarlo(baseInputs(), { iterations: 400, seed: 5 });
  assert.ok(r.driverOrder.includes('Occupancy'), 'occupancy driver present');
  assert.ok(r.driverOrder.includes('Opex Ratio'), 'opex ratio driver present');
  assert.equal(
    r.correlationMatrix.length,
    r.driverOrder.length,
    'corr matrix matches driver count'
  );
  assert.equal(r.realizedCorrelation.length, r.driverOrder.length, 'realized matrix matches');

  const occ = r.drivers[r.driverOrder.indexOf('Occupancy')]!;
  // Occupancy actually varies (min < max) — it is no longer frozen.
  assert.ok(occ.maxDrawnPct > occ.minDrawnPct, 'occupancy is drawn, not frozen');
  const opex = r.drivers[r.driverOrder.indexOf('Opex Ratio')]!;
  assert.ok(opex.maxDrawnPct > opex.minDrawnPct, 'opex ratio is drawn, not frozen');
});
