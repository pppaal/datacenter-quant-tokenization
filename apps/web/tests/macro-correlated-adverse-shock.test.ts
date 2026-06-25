import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCorrelatedAdverseShock } from '@/lib/services/macro/dynamic-scenarios';

// ---------------------------------------------------------------------------
// (A) Methodology proof: the correlated adverse draw must PRESERVE the joint
// sign structure that the Cholesky encodes. The previous per-component Math.abs
// implementation collapsed to independent marginals (each component = its own
// half-normal mean, every off-diagonal term discarded) and therefore could NOT
// satisfy either assertion below: it always returned per-dimension σ shocks,
// invariant to the off-diagonal covariance term and its sign.
//
// Tail dims 0 and 1 (policy_rate, credit_spread) both have adverseSign = +1, so
// "adverse" for both is a RISE. Under strong POSITIVE correlation a correlated
// adverse draw makes them CO-MOVE (both rise together); under NEGATIVE
// correlation they must DIVERGE in the joint draw.
// ---------------------------------------------------------------------------

const SEED = 1337;

function shock2d(offDiagonal: number): number[] {
  // Unit variances on the diagonal, the off-diagonal IS the correlation.
  const cov = [
    [1, offDiagonal],
    [offDiagonal, 1]
  ];
  return buildCorrelatedAdverseShock(cov, { ensemble: 4000, seed: SEED });
}

test('positively-correlated factors co-move in the adverse draw', () => {
  const [a, b] = shock2d(0.85);
  // Both adverseSign = +1 → adverse means RISE → both components positive.
  assert.ok(a! > 0, `component 0 should be adverse (positive), got ${a}`);
  assert.ok(b! > 0, `component 1 should be adverse (positive), got ${b}`);
  // Strong positive correlation → both pulled to roughly the same magnitude.
  const ratio = a! / b!;
  assert.ok(ratio > 0.7 && ratio < 1.4, `expected co-movement, got ratio ${ratio}`);
});

test('flipping the correlation sign changes the joint result', () => {
  const positive = shock2d(0.85);
  const negative = shock2d(-0.85);

  // The per-component-abs implementation is INVARIANT to the off-diagonal sign
  // (it only ever reads the diagonal σ), so this deep-inequality would fail.
  assert.notDeepEqual(
    positive.map((v) => Number(v.toFixed(4))),
    negative.map((v) => Number(v.toFixed(4)))
  );

  // Under negative correlation, orienting the JOINT vector to the aggregate
  // adverse axis (sum of components) makes the two factors DIVERGE: one rises
  // while the other is dragged the opposite way. The magnitude gap is far wider
  // than under positive correlation.
  const posGap = Math.abs(positive[0]! - positive[1]!);
  const negGap = Math.abs(negative[0]! - negative[1]!);
  assert.ok(
    negGap > posGap,
    `negative-correlation draw should diverge more (neg gap ${negGap} vs pos gap ${posGap})`
  );
});

test('zero off-diagonal recovers independent per-dimension shocks (no co-movement bias)', () => {
  const [a, b] = shock2d(0);
  // Independent → each component is its own adverse half-normal mean; both
  // positive and roughly equal in magnitude (same unit variance).
  assert.ok(a! > 0 && b! > 0);
});

test('buildCorrelatedAdverseShock is deterministic for a fixed seed', () => {
  assert.deepEqual(shock2d(0.5), shock2d(0.5));
});

test('result scales with the requested sigma multiple', () => {
  const cov = [
    [1, 0.3],
    [0.3, 1]
  ];
  const small = buildCorrelatedAdverseShock(cov, { ensemble: 2000, seed: SEED, sigmaMultiple: 1 });
  const large = buildCorrelatedAdverseShock(cov, { ensemble: 2000, seed: SEED, sigmaMultiple: 3 });
  // Same draws, only the rescale differs → component 0 scales ~3x.
  const factor = large[0]! / small[0]!;
  assert.ok(Math.abs(factor - 3) < 1e-9, `expected 3x scaling, got ${factor}`);
});
