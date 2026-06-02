// ---------------------------------------------------------------------------
// Canonical numerical primitives shared across the quant stack.
//
// This is the single source of truth for the seeded PRNG (mulberry32), the
// Box-Muller standard-normal generator, and the Cholesky factorization +
// application helpers. These were previously duplicated byte-for-byte between
// `lib/services/valuation/monte-carlo.ts` and `lib/services/macro/covariance.ts`.
//
// IMPORTANT: the implementations here are bit-for-bit identical to those
// originals. Monte-Carlo determinism and audit-log reproducibility depend on
// the exact arithmetic; do NOT "improve" the math.
// ---------------------------------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — deterministic across runs given the same seed.
 * Returns a generator producing uniforms in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller → one standard normal per call. We use two uniforms each draw
 * and discard the cos-pair's second value; cheap given mulberry32 is ~1 cycle.
 */
export function standardNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Cholesky factorization: lower-triangular L s.t. L Lᵀ = Σ.
 *
 * - `clamp: false` (default) — throws if Σ is not positive-definite. This is
 *   the Monte-Carlo behavior: a non-PSD correlation matrix is a hard error.
 * - `clamp: true` — clamps a non-PSD diagonal to 0 (rather than throwing),
 *   yielding a total function. Callers that pass eigenvalue-clipped matrices
 *   (e.g. macro covariance) want this; the corresponding column of L is left
 *   zero.
 */
export function cholesky(matrix: number[][], options?: { clamp?: boolean }): number[][] {
  const clamp = options?.clamp ?? false;
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i]![k]! * L[j]![k]!;
      if (i === j) {
        const diag = matrix[i]![i]! - sum;
        if (clamp) {
          L[i]![j] = diag > 0 ? Math.sqrt(diag) : 0;
        } else {
          if (diag <= 0) {
            throw new Error(
              `Correlation matrix is not positive-definite at index ${i} (got ${diag.toFixed(4)}). ` +
                `Reduce off-diagonal magnitudes or verify symmetry.`
            );
          }
          L[i]![j] = Math.sqrt(diag);
        }
      } else {
        if (clamp) {
          const denom = L[j]![j]!;
          L[i]![j] = denom > 0 ? (matrix[i]![j]! - sum) / denom : 0;
        } else {
          L[i]![j] = (matrix[i]![j]! - sum) / L[j]![j]!;
        }
      }
    }
  }
  return L;
}

/** Apply a Cholesky factor: x = L z. */
export function applyCholesky(L: number[][], z: number[]): number[] {
  const n = L.length;
  const x: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j <= i; j++) v += L[i]![j]! * z[j]!;
    x[i] = v;
  }
  return x;
}
