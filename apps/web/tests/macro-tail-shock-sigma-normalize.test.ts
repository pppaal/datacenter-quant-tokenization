import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorrelatedAdverseShock } from '@/lib/services/macro/dynamic-scenarios';

// adverseSign vector the production helper uses for dim 1..5. For the 5×5 tail
// set this is [+1, +1, +1, -1, +1]; for smaller dims the helper defaults the
// unmapped tail to its TAIL_DIMENSIONS sign (all +1 beyond index 3).
function adverseSigns(dim: number): number[] {
  const tail = [+1, +1, +1, -1, +1];
  return Array.from({ length: dim }, (_, i) => tail[i] ?? 1);
}

// Realized projection of a shock onto the adverse axis: s = aᵀr.
function adverseProjection(shock: number[]): number {
  const a = adverseSigns(shock.length);
  let s = 0;
  for (let i = 0; i < shock.length; i++) s += a[i]! * shock[i]!;
  return s;
}

function scaleMatrix(m: number[][], c: number): number[][] {
  return m.map((row) => row.map((x) => x * c));
}

// A correlated 3×3 covariance (off-diagonals non-trivial so aᵀΣa ≠ Σσᵢ²).
const COV: number[][] = [
  [4, 1.5, -0.5],
  [1.5, 2, 0.8],
  [-0.5, 0.8, 1]
];

// ---------------------------------------------------------------------------
// The adverse axis genuinely sits at sigmaMultiple σ. After the √(aᵀΣa)
// normalization the returned vector lives in σ-units, so the adverse-axis
// projection aᵀr equals sigmaMultiple directly (no further /σ needed).
// ---------------------------------------------------------------------------
test('realized adverse-axis projection equals sigmaMultiple σ', () => {
  for (const sigmaMultiple of [1, 2, 2.3, 4]) {
    const shock = buildCorrelatedAdverseShock(COV, { sigmaMultiple, ensemble: 4096 });
    const projInSigma = adverseProjection(shock);
    assert.ok(
      Math.abs(projInSigma - sigmaMultiple) < 0.05,
      `sigmaMultiple=${sigmaMultiple}: adverse axis at ${projInSigma.toFixed(3)}σ`
    );
  }
});

// ---------------------------------------------------------------------------
// Linearity in sigmaMultiple: doubling sigmaMultiple doubles the projection.
// ---------------------------------------------------------------------------
test('adverse-axis projection scales linearly with sigmaMultiple', () => {
  const p1 = adverseProjection(
    buildCorrelatedAdverseShock(COV, { sigmaMultiple: 1, ensemble: 4096 })
  );
  const p2 = adverseProjection(
    buildCorrelatedAdverseShock(COV, { sigmaMultiple: 2, ensemble: 4096 })
  );
  const p4 = adverseProjection(
    buildCorrelatedAdverseShock(COV, { sigmaMultiple: 4, ensemble: 4096 })
  );
  assert.ok(Math.abs(p2 / p1 - 2) < 1e-9, `p2/p1 = ${p2 / p1}`);
  assert.ok(Math.abs(p4 / p1 - 4) < 1e-9, `p4/p1 = ${p4 / p1}`);
});

// ---------------------------------------------------------------------------
// Scale invariance: scaling Σ by c leaves the σ-normalized adverse axis fixed.
// This is the property the OLD code violated (it scaled with √c).
// ---------------------------------------------------------------------------
test('σ-normalized adverse axis is invariant to a covariance scale factor', () => {
  const sigmaMultiple = 2.3;
  for (const c of [0.25, 1, 9, 100]) {
    const scaled = scaleMatrix(COV, c);
    const shock = buildCorrelatedAdverseShock(scaled, { sigmaMultiple, ensemble: 4096 });
    const projInSigma = adverseProjection(shock);
    assert.ok(
      Math.abs(projInSigma - sigmaMultiple) < 0.05,
      `c=${c}: adverse axis at ${projInSigma.toFixed(3)}σ (expected ${sigmaMultiple})`
    );
  }
});

// ---------------------------------------------------------------------------
// Degenerate covariance (zero adverse-axis variance) returns a zero vector
// rather than dividing by zero.
// ---------------------------------------------------------------------------
test('zero adverse-axis variance yields a zero shock (no division by zero)', () => {
  const zero = [
    [0, 0],
    [0, 0]
  ];
  const shock = buildCorrelatedAdverseShock(zero, { sigmaMultiple: 2.3 });
  assert.equal(shock.length, 2);
  assert.ok(shock.every((v) => v === 0));
});
