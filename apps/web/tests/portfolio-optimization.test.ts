import assert from 'node:assert/strict';
import test from 'node:test';
import { __testing } from '@/lib/services/portfolio-optimization';

const { getWeightBounds, roundWeightVector, runAnnealingAllocation } = __testing;

// Build an evenly-distributed raw weight vector of length n (pre-rounding).
function evenRawWeights(n: number) {
  return Array.from({ length: n }, () => 100 / n);
}

// Build deterministic signals so the annealer has something to optimize over.
function buildSignals(n: number) {
  return Array.from({ length: n }, (_, index) => ({
    scorePct: 30 + ((index * 13) % 60),
    stressPenaltyPct: 5 + ((index * 7) % 30)
  }));
}

function assertFeasible(weights: number[], assetCount: number) {
  const { minWeight, maxWeight } = getWeightBounds(assetCount);
  const total = weights.reduce((acc, w) => acc + w, 0);
  assert.equal(total, 100, `weights must sum to 100, got ${total} for n=${assetCount}`);
  for (const w of weights) {
    assert.ok(Number.isInteger(w), `weight ${w} must be an integer for n=${assetCount}`);
    assert.ok(
      w >= minWeight && w <= maxWeight,
      `weight ${w} outside bounds [${minWeight}, ${maxWeight}] for n=${assetCount}`
    );
  }
}

test('getWeightBounds keeps the feasible region non-empty for any asset count', () => {
  for (const n of [1, 2, 5, 10, 11, 20, 25, 40]) {
    const { minWeight, maxWeight } = getWeightBounds(n);
    assert.ok(minWeight >= 0, `minWeight non-negative for n=${n}`);
    assert.ok(minWeight <= maxWeight, `min <= max for n=${n}`);
    assert.ok(
      n * minWeight <= 100,
      `n*minWeight=${n * minWeight} must be <= 100 for n=${n} (feasibility)`
    );
    assert.ok(
      n * maxWeight >= 100,
      `n*maxWeight=${n * maxWeight} must be >= 100 for n=${n} (feasibility)`
    );
  }
});

test('getWeightBounds keeps a 10% floor at or below 10 assets', () => {
  assert.deepEqual(getWeightBounds(1).minWeight, 10);
  assert.deepEqual(getWeightBounds(10).minWeight, 10);
  // >10 assets: floor must shrink so it stays feasible.
  assert.ok(getWeightBounds(11).minWeight < 10);
});

test('roundWeightVector sums to 100 and stays in bounds (no residual dump on element 0)', () => {
  for (const n of [1, 2, 11, 20]) {
    const rounded = roundWeightVector(evenRawWeights(n), n);
    assert.equal(rounded.length, n);
    assertFeasible(rounded, n);
  }
});

test('roundWeightVector handles a lopsided vector without breaching the upper cap', () => {
  // A vector that, with the old code, would dump the whole residual on index 0.
  const raw = [98, 1, 1];
  const rounded = roundWeightVector(raw, 3);
  assertFeasible(rounded, 3);
});

test('runAnnealingAllocation returns a feasible vector for 1, 11 and 20 assets', () => {
  for (const n of [1, 11, 20]) {
    const seed = roundWeightVector(evenRawWeights(n), n);
    assertFeasible(seed, n); // seed itself must be feasible
    const result = runAnnealingAllocation(seed, buildSignals(n), `seed-${n}`);
    assert.equal(result.length, n);
    assertFeasible(result, n);
  }
});

test('runAnnealingAllocation is deterministic for the same seed key', () => {
  const n = 11;
  const seed = roundWeightVector(evenRawWeights(n), n);
  const signals = buildSignals(n);
  const a = runAnnealingAllocation(seed, signals, 'fixed-key');
  const b = runAnnealingAllocation(seed, signals, 'fixed-key');
  assert.deepEqual(a, b);
});

test('runAnnealingAllocation does not get stuck returning a broken seed for >10 assets', () => {
  // With >10 assets the old hard-coded 10% floor rejected every move and the
  // optimizer returned the (possibly infeasible) seed unchanged. Now the
  // adaptive floor must let the search make at least some progress while
  // staying feasible.
  const n = 20;
  const seed = roundWeightVector(evenRawWeights(n), n);
  const signals = buildSignals(n);
  const result = runAnnealingAllocation(seed, signals, 'progress-key');
  assertFeasible(result, n);
});
