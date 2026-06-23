import assert from 'node:assert/strict';
import test from 'node:test';
import type { MacroSeries } from '@prisma/client';
import {
  alignSeriesChanges,
  sampleCovariance,
  ledoitWolfShrinkage,
  enforcePsd,
  symmetricEigenvalues,
  covarianceToCorrelation,
  choleskyPsd,
  applyCholesky,
  mulberry32,
  standardNormal,
  drawCorrelatedShock,
  estimateFactorCovariance,
  MIN_CHANGE_OBSERVATIONS
} from '@/lib/services/macro/covariance';

// ---------------------------------------------------------------------------
// Synthetic MacroSeries factory
// ---------------------------------------------------------------------------
function makeSeries(market: string, perKeyValues: Record<string, number[]>): MacroSeries[] {
  const out: MacroSeries[] = [];
  const base = new Date(Date.UTC(2024, 0, 1));
  let i = 0;
  for (const [seriesKey, values] of Object.entries(perKeyValues)) {
    values.forEach((value, t) => {
      const observationDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + t, 1));
      out.push({
        id: `s-${seriesKey}-${t}-${i++}`,
        assetId: null,
        market,
        seriesKey,
        label: seriesKey,
        frequency: 'monthly',
        observationDate,
        value,
        unit: '%',
        sourceSystem: 'test',
        sourceStatus: 'FRESH' as MacroSeries['sourceStatus'],
        sourceUpdatedAt: observationDate,
        createdAt: observationDate,
        updatedAt: observationDate
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alignment + first-differencing
// ---------------------------------------------------------------------------
test('alignSeriesChanges produces contemporaneous first differences', () => {
  const series = makeSeries('SEOUL', {
    a: [1, 2, 4, 7],
    b: [10, 20, 20, 25]
  });
  const aligned = alignSeriesChanges(series, ['a', 'b'], 'SEOUL');
  assert.equal(aligned.observationCount, 3); // 4 levels → 3 changes
  assert.deepEqual(aligned.changes, [
    [1, 10],
    [2, 0],
    [3, 5]
  ]);
});

test('alignSeriesChanges keeps only dates present in all series', () => {
  // b is missing its last observation date → only 3 common dates → 2 changes.
  const series = makeSeries('SEOUL', {
    a: [1, 2, 4, 7],
    b: [10, 20, 30]
  });
  const aligned = alignSeriesChanges(series, ['a', 'b'], 'SEOUL');
  assert.equal(aligned.observationCount, 2);
});

// ---------------------------------------------------------------------------
// Sample covariance symmetry
// ---------------------------------------------------------------------------
test('sampleCovariance is symmetric', () => {
  const changes = [
    [1, 2],
    [2, 1],
    [3, 5],
    [-1, 0]
  ];
  const cov = sampleCovariance(changes);
  assert.equal(cov[0]![1], cov[1]![0]);
});

// ---------------------------------------------------------------------------
// PSD: all eigenvalues >= 0 within tolerance
// ---------------------------------------------------------------------------
test('estimated covariance is symmetric PSD', () => {
  const rng = mulberry32(7);
  // 3 correlated series over 24 months.
  const n = 24;
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  let la = 5,
    lb = 100,
    lc = 50;
  for (let t = 0; t < n; t++) {
    const shock = standardNormal(rng);
    la += 0.3 * shock + 0.1 * standardNormal(rng);
    lb += 8 * shock + 2 * standardNormal(rng);
    lc += -0.2 * shock + 0.5 * standardNormal(rng);
    a.push(la);
    b.push(lb);
    c.push(lc);
  }
  const series = makeSeries('SEOUL', { a, b, c });
  const est = estimateFactorCovariance(series, ['a', 'b', 'c'], 'SEOUL');

  // symmetry
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      assert.ok(Math.abs(est.covariance[i]![j]! - est.covariance[j]![i]!) < 1e-9);

  // PSD: eigenvalues >= -tol
  const eigs = symmetricEigenvalues(est.covariance);
  for (const e of eigs) assert.ok(e >= -1e-8, `eigenvalue ${e} negative`);

  assert.ok(est.sufficient);
  assert.equal(est.observationCount, n - 1);
});

test('enforcePsd clips a non-PSD matrix to PSD', () => {
  // Indefinite symmetric matrix (eigenvalues 3 and -1).
  const m = [
    [1, 2],
    [2, 1]
  ];
  const eigsBefore = symmetricEigenvalues(m);
  assert.ok(Math.min(...eigsBefore) < 0);

  const psd = enforcePsd(m, 0);
  const eigsAfter = symmetricEigenvalues(psd);
  for (const e of eigsAfter) assert.ok(e >= -1e-9);
});

// ---------------------------------------------------------------------------
// Shrinkage moves a near-singular sample toward the diagonal target
// ---------------------------------------------------------------------------
test('shrinkage reduces off-diagonal magnitude of a near-singular sample', () => {
  // Two near-collinear series with only a few observations → near-singular S
  // with strong off-diagonal. Shrinkage should pull off-diagonals toward 0.
  const changes = [
    [1.0, 2.01],
    [2.0, 3.99],
    [3.0, 6.02],
    [4.0, 7.98],
    [-1.0, -2.0]
  ];
  const sample = sampleCovariance(changes);
  const { covariance: shrunk, shrinkageIntensity } = ledoitWolfShrinkage(changes);

  assert.ok(shrinkageIntensity > 0 && shrinkageIntensity <= 1);
  // Diagonal preserved.
  assert.ok(Math.abs(shrunk[0]![0]! - sample[0]![0]!) < 1e-9);
  assert.ok(Math.abs(shrunk[1]![1]! - sample[1]![1]!) < 1e-9);
  // Off-diagonal shrunk strictly toward the diagonal target (0).
  assert.ok(Math.abs(shrunk[0]![1]!) < Math.abs(sample[0]![1]!));
  // The shrunk correlation is strictly below the (near 1.0) sample correlation.
  const sampleCorr = sample[0]![1]! / Math.sqrt(sample[0]![0]! * sample[1]![1]!);
  const shrunkCorr = shrunk[0]![1]! / Math.sqrt(shrunk[0]![0]! * shrunk[1]![1]!);
  assert.ok(shrunkCorr < sampleCorr);
});

// ---------------------------------------------------------------------------
// Cholesky correctness
// ---------------------------------------------------------------------------
test('choleskyPsd reproduces the matrix as L Lᵀ', () => {
  const sigma = [
    [4, 2, 0.5],
    [2, 3, 0.2],
    [0.5, 0.2, 1]
  ];
  const L = choleskyPsd(sigma);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += L[i]![k]! * L[j]![k]!;
      assert.ok(Math.abs(v - sigma[i]![j]!) < 1e-9);
    }
  }
});

// ---------------------------------------------------------------------------
// Correlated shocks reproduce the target correlation in expectation
// ---------------------------------------------------------------------------
test('correlated draws reproduce target correlation on a large sample', () => {
  const targetCorr = 0.6;
  const sd = [2, 5];
  // covariance from correlation + sds
  const cov = [
    [sd[0]! ** 2, targetCorr * sd[0]! * sd[1]!],
    [targetCorr * sd[0]! * sd[1]!, sd[1]! ** 2]
  ];
  const L = choleskyPsd(cov);
  const rng = mulberry32(2024);

  const N = 40000;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < N; i++) {
    const draw = drawCorrelatedShock(L, rng);
    xs.push(draw[0]!);
    ys.push(draw[1]!);
  }

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < N; i++) {
    const da = xs[i]! - mx;
    const db = ys[i]! - my;
    num += da * db;
    dx += da * da;
    dy += db * db;
  }
  const realized = num / Math.sqrt(dx * dy);
  assert.ok(
    Math.abs(realized - targetCorr) < 0.03,
    `realized correlation ${realized} far from target ${targetCorr}`
  );

  // realized standard deviations ≈ target σ
  const realizedSdX = Math.sqrt(dx / N);
  const realizedSdY = Math.sqrt(dy / N);
  assert.ok(Math.abs(realizedSdX - sd[0]!) < 0.1);
  assert.ok(Math.abs(realizedSdY - sd[1]!) < 0.2);
});

// ---------------------------------------------------------------------------
// Insufficiency threshold
// ---------------------------------------------------------------------------
test('estimate is flagged insufficient below MIN_CHANGE_OBSERVATIONS', () => {
  // 5 levels → 4 changes, well below the threshold.
  const series = makeSeries('SEOUL', {
    a: [1, 2, 3, 4, 5],
    b: [2, 4, 6, 8, 10]
  });
  const est = estimateFactorCovariance(series, ['a', 'b'], 'SEOUL');
  assert.ok(est.observationCount < MIN_CHANGE_OBSERVATIONS);
  assert.equal(est.sufficient, false);
});

test('applyCholesky on identity returns input', () => {
  const I = [
    [1, 0],
    [0, 1]
  ];
  assert.deepEqual(applyCholesky(I, [3, -2]), [3, -2]);
  assert.deepEqual(covarianceToCorrelation(I), I);
});

// ---------------------------------------------------------------------------
// Correlation coefficients must stay within [-1, 1]
// ---------------------------------------------------------------------------
test('covarianceToCorrelation clamps off-diagonal to the [-1, 1] range', () => {
  // A symmetric matrix whose off-diagonal exceeds sqrt(var_i · var_j) is not a
  // valid covariance (it would imply |ρ| > 1). The conversion must still return
  // a well-formed correlation matrix bounded by ±1.
  const notPsd = [
    [1, 2],
    [2, 1]
  ];
  const corr = covarianceToCorrelation(notPsd);
  assert.equal(corr[0]![0], 1);
  assert.equal(corr[1]![1], 1);
  assert.equal(corr[0]![1], 1, 'positive overshoot is clamped to +1');
  assert.equal(corr[1]![0], 1);

  const negativeOvershoot = [
    [1, -3],
    [-3, 4]
  ];
  const corrNeg = covarianceToCorrelation(negativeOvershoot);
  assert.equal(corrNeg[0]![1], -1, 'negative overshoot is clamped to -1');
  assert.equal(corrNeg[1]![0], -1);

  // A genuine, in-range correlation is preserved (not clamped away).
  const valid = [
    [4, 1],
    [1, 1]
  ];
  const corrValid = covarianceToCorrelation(valid);
  assert.ok(Math.abs(corrValid[0]![1]! - 0.5) < 1e-12);
});
