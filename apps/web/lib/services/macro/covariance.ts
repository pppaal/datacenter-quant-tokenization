import type { MacroSeries } from '@prisma/client';
import { mulberry32, standardNormal, applyCholesky, cholesky } from '@/lib/finance/numerics';

export { mulberry32, standardNormal, applyCholesky };

/**
 * Data-driven covariance / correlation estimation for macro factor changes.
 *
 * This module replaces the previous hand-tuned heuristic constants with a
 * statistical estimate derived from MacroSeries history. The pipeline is:
 *
 *   1. Align MacroSeries observations into a per-series time-ordered vector
 *      keyed by observationDate (only dates present for ALL requested series
 *      are kept, so rows are contemporaneous).
 *   2. Convert levels into period-over-period CHANGES (first differences).
 *      Correlating raw levels of trending series gives spuriously high
 *      correlation; changes are what the stress amplifier cares about.
 *   3. Estimate the sample covariance of the changes, then apply
 *      Ledoit-Wolf-style shrinkage toward a diagonal target (the sample
 *      variances on the diagonal, zeros off-diagonal). Shrinkage makes the
 *      estimate well-conditioned when observations are few.
 *   4. Enforce PSD via an eigenvalue clip (symmetric Jacobi eigendecomposition,
 *      negative eigenvalues clipped to 0) so a Cholesky factorization always
 *      succeeds downstream.
 *
 * The PSD-safe Cholesky and seeded standard-normal generator MIRROR the
 * implementation in lib/services/valuation/monte-carlo.ts (those helpers are
 * file-private there); they are re-exported here so the macro layer can reuse
 * an identical, already-validated numerical routine.
 */

// ---------------------------------------------------------------------------
// Minimum observations required to trust a data-driven estimate. Below this,
// callers should fall back to expert constants. A covariance over N change
// observations needs comfortably more rows than series; 8 change rows (i.e.
// 9 aligned level observations) is the floor we accept.
// ---------------------------------------------------------------------------
export const MIN_CHANGE_OBSERVATIONS = 8;

export type AlignedChanges = {
  seriesKeys: string[];
  /** changes[t][i] = change of series i at aligned time step t */
  changes: number[][];
  observationCount: number;
};

/**
 * Align MacroSeries into a matrix of contemporaneous first-differences.
 * Only the requested seriesKeys are considered; only observation dates present
 * for every requested series are retained so every row is fully populated.
 */
export function alignSeriesChanges(
  series: MacroSeries[],
  seriesKeys: string[],
  market?: string
): AlignedChanges {
  // value-by-date for each series key
  const byKey = new Map<string, Map<number, number>>();
  for (const key of seriesKeys) byKey.set(key, new Map());

  for (const point of series) {
    if (market && point.market !== market) continue;
    const target = byKey.get(point.seriesKey);
    if (!target) continue;
    const t = point.observationDate.getTime();
    // Keep the last write for a (key,date) pair; inputs are expected unique.
    target.set(t, point.value);
  }

  // Dates present in ALL requested series.
  let commonDates: number[] | null = null;
  for (const key of seriesKeys) {
    const dates = new Set(byKey.get(key)!.keys());
    if (commonDates === null) {
      commonDates = [...dates];
    } else {
      commonDates = commonDates.filter((d) => dates.has(d));
    }
  }
  const sortedDates = (commonDates ?? []).sort((a, b) => a - b);

  // Build level matrix, then first-difference.
  const levels: number[][] = sortedDates.map((d) =>
    seriesKeys.map((key) => byKey.get(key)!.get(d)!)
  );

  const changes: number[][] = [];
  for (let t = 1; t < levels.length; t++) {
    const row = seriesKeys.map((_, i) => levels[t]![i]! - levels[t - 1]![i]!);
    changes.push(row);
  }

  return { seriesKeys, changes, observationCount: changes.length };
}

// ---------------------------------------------------------------------------
// Sample covariance
// ---------------------------------------------------------------------------
export function sampleCovariance(changes: number[][]): number[][] {
  const n = changes.length;
  const p = n > 0 ? changes[0]!.length : 0;
  const cov: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  if (n < 2) return cov;

  const means = new Array(p).fill(0);
  for (const row of changes) for (let i = 0; i < p; i++) means[i] += row[i]!;
  for (let i = 0; i < p; i++) means[i] /= n;

  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += (changes[t]![i]! - means[i]) * (changes[t]![j]! - means[j]);
      const v = s / (n - 1); // unbiased
      cov[i]![j] = v;
      cov[j]![i] = v;
    }
  }
  return cov;
}

// ---------------------------------------------------------------------------
// Ledoit-Wolf-style shrinkage toward a diagonal target.
//
// Σ_shrunk = δ · T + (1 - δ) · S
//   S = sample covariance
//   T = diag(S)  (the diagonal target: keeps variances, kills covariances)
//   δ = shrinkage intensity in [0,1]
//
// We estimate δ with the canonical Ledoit-Wolf ratio:
//   δ* = clamp( π̂ / γ̂ , 0, 1 )
//   γ̂ = Σ_{i≠j} S_ij²          (off-diagonal dispersion of S from target)
//   π̂ ≈ (1/n) Σ_t Σ_{i≠j} ( (x_ti·x_tj) - S_ij )²   (sampling error of S off-diag)
// When n is small relative to p, π̂/γ̂ → 1 and the estimate collapses toward the
// diagonal target — exactly the well-conditioning we want.
// ---------------------------------------------------------------------------
export type ShrinkageResult = {
  covariance: number[][];
  shrinkageIntensity: number;
};

export function ledoitWolfShrinkage(changes: number[][]): ShrinkageResult {
  const n = changes.length;
  const p = n > 0 ? changes[0]!.length : 0;
  const sample = sampleCovariance(changes);

  if (n < 2 || p === 0) {
    return { covariance: sample, shrinkageIntensity: 1 };
  }

  // De-mean the data once.
  const means = new Array(p).fill(0);
  for (const row of changes) for (let i = 0; i < p; i++) means[i] += row[i]!;
  for (let i = 0; i < p; i++) means[i] /= n;
  const centered = changes.map((row) => row.map((v, i) => v - means[i]));

  // γ̂: squared off-diagonal mass of the sample covariance vs diagonal target.
  let gamma = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      if (i === j) continue;
      gamma += sample[i]![j]! ** 2;
    }
  }

  // π̂: total sampling variance of the off-diagonal sample-cov entries.
  let pi = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      if (i === j) continue;
      let acc = 0;
      for (let t = 0; t < n; t++) {
        const prod = centered[t]![i]! * centered[t]![j]!;
        acc += (prod - sample[i]![j]!) ** 2;
      }
      pi += acc / n;
    }
  }

  let delta = gamma > 0 ? pi / gamma : 1;
  delta = Math.max(0, Math.min(1, delta));

  // Σ_shrunk = δ·diag(S) + (1-δ)·S  → diagonal untouched, off-diag scaled by (1-δ).
  const out: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      if (i === j) out[i]![j] = sample[i]![i]!;
      else out[i]![j] = (1 - delta) * sample[i]![j]!;
    }
  }

  return { covariance: out, shrinkageIntensity: delta };
}

// ---------------------------------------------------------------------------
// Symmetric eigendecomposition (cyclic Jacobi) — small matrices only.
// Returns { values, vectors } where vectors[k] is the k-th eigenvector.
// ---------------------------------------------------------------------------
function jacobiEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  // Work on a copy.
  const a = input.map((row) => [...row]);
  // V starts as identity (columns are eigenvectors).
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  const maxSweeps = 100;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // off-diagonal magnitude
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! ** 2;
    if (off < 1e-18) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const app = a[p]![p]!;
        const aqq = a[q]![q]!;
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi);
        const s = Math.sin(phi);

        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const values = a.map((row, i) => row[i]!);
  // vectors[k] = k-th eigenvector = column k of v
  const vectors = values.map((_, k) => v.map((row) => row[k]!));
  return { values, vectors };
}

/**
 * Project a symmetric matrix onto the PSD cone by clipping negative eigenvalues
 * to `floor` (default 0) and reconstituting Σ = V Λ⁺ Vᵀ.
 */
export function enforcePsd(matrix: number[][], floor = 0): number[][] {
  const n = matrix.length;
  if (n === 0) return matrix;
  // Symmetrize defensively.
  const sym: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (matrix[i]![j]! + matrix[j]![i]!) / 2)
  );
  const { values, vectors } = jacobiEigen(sym);
  const clipped = values.map((lambda) => Math.max(floor, lambda));

  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k++) {
    const lam = clipped[k]!;
    if (lam === 0) continue;
    const vec = vectors[k]!;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        out[i]![j] += lam * vec[i]! * vec[j]!;
      }
    }
  }
  // Re-symmetrize against floating drift.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const avg = (out[i]![j]! + out[j]![i]!) / 2;
      out[i]![j] = avg;
      out[j]![i] = avg;
    }
  }
  return out;
}

/** Eigenvalues of a symmetric matrix (ascending not guaranteed). */
export function symmetricEigenvalues(matrix: number[][]): number[] {
  if (matrix.length === 0) return [];
  return jacobiEigen(matrix).values;
}

/** Convert a covariance matrix to a correlation matrix. */
export function covarianceToCorrelation(cov: number[][]): number[][] {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));
  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const denom = sd[i]! * sd[j]!;
      corr[i]![j] = i === j ? 1 : denom > 0 ? cov[i]![j]! / denom : 0;
    }
  }
  return corr;
}

/** Per-series standard deviation of changes (the σ used for shock sizing). */
export function changeStdDevs(cov: number[][]): number[] {
  return cov.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));
}

// ---------------------------------------------------------------------------
// PSD-safe Cholesky — the canonical clamping variant from `@/lib/finance/numerics`.
// Lower-triangular L s.t. L Lᵀ = Σ. A non-PSD diagonal is clamped to 0 (rather
// than thrown) because callers here pass eigenvalue-clipped matrices and want a
// total function; the corresponding column of L is left zero.
// ---------------------------------------------------------------------------
export function choleskyPsd(matrix: number[][]): number[][] {
  return cholesky(matrix, { clamp: true });
}

// Seeded standard-normal generator (mulberry32 + Box-Muller), the Cholesky
// application helper, and the seeded PRNG are re-exported above from
// `@/lib/finance/numerics` so macro draws stay deterministic and reproducible
// in audit logs.

/**
 * Draw one correlated shock vector x ~ N(0, Σ) using L = chol(Σ) and a seeded
 * normal generator: x = L z, z ~ N(0, I).
 */
export function drawCorrelatedShock(L: number[][], rng: () => number): number[] {
  const z = L.map(() => standardNormal(rng));
  return applyCholesky(L, z);
}

// ---------------------------------------------------------------------------
// High-level estimator: history → well-conditioned PSD covariance + correlation
// ---------------------------------------------------------------------------
export type FactorCovarianceEstimate = {
  seriesKeys: string[];
  observationCount: number;
  /** true when observationCount >= MIN_CHANGE_OBSERVATIONS */
  sufficient: boolean;
  shrinkageIntensity: number;
  covariance: number[][];
  correlation: number[][];
  stdDevs: number[];
};

export function estimateFactorCovariance(
  series: MacroSeries[],
  seriesKeys: string[],
  market?: string
): FactorCovarianceEstimate {
  const aligned = alignSeriesChanges(series, seriesKeys, market);
  const { covariance: shrunk, shrinkageIntensity } = ledoitWolfShrinkage(aligned.changes);
  const psd = enforcePsd(shrunk, 0);
  return {
    seriesKeys,
    observationCount: aligned.observationCount,
    sufficient: aligned.observationCount >= MIN_CHANGE_OBSERVATIONS,
    shrinkageIntensity,
    covariance: psd,
    correlation: covarianceToCorrelation(psd),
    stdDevs: changeStdDevs(psd)
  };
}
