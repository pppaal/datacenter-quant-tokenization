/**
 * Hedonic regression for KR transaction comps.
 *
 * Given a set of TransactionComp rows, fits an OLS model of
 *   ln(price_per_sqm) = β₀ + β₁·ln(size) + β₂·vintage + Σβᵢ·dummies + ε
 *
 * and returns the fitted line for any new asset. Used by the IM to
 * surface a "fitted price" comparable independent of the raw comp
 * average — controls for size / vintage / submarket / tier so a
 * 5,000 sqm Gangnam Tier A is not benchmarked against a 50,000 sqm
 * Yeouido Tier B.
 *
 * Pure function, no DB / IO.  Linear algebra implemented in plain
 * JS with O(n × p²) cost — fine for KR comp universes (≤ 10k rows).
 *
 * The math:
 *   - Build design matrix X (n × p) with intercept + numeric +
 *     one-hot encoded categorical dummies.
 *   - Solve normal equations (XᵀX) β = Xᵀy via Cholesky-style
 *     Gaussian elimination on the symmetric system.
 *   - Compute fitted value, residuals, R².
 *
 * Shrinkage / Bayesian prior is NOT applied here — for thin
 * submarkets the caller should pass a wider-market subset and
 * rely on submarket dummy attenuation.
 */

export type CompRow = {
  pricePerSqmKrw: number;
  sizeSqm: number | null;
  vintageYear?: number | null;
  submarket?: string | null;
  tier?: string | null;
  dealStructure?: string | null;
};

export type HedonicQuery = {
  sizeSqm: number;
  vintageYear?: number;
  submarket?: string;
  tier?: string;
  dealStructure?: string;
};

export type HedonicFit = {
  /** OLS coefficients keyed by feature name. */
  coefficients: Record<string, number>;
  /** Fitted ln(price/sqm) at the query point. */
  fittedLogPricePerSqm: number;
  /** exp(fittedLogPricePerSqm) — the IM-renderable headline. */
  fittedPricePerSqmKrw: number;
  /** Coefficient of determination on the fit set. */
  rSquared: number;
  /** Number of observations used. */
  n: number;
  /** Number of fitted parameters. */
  p: number;
  /** Adjusted R² (penalises model size). */
  adjustedRSquared: number;
  /** Mean residual standard error in log space. */
  residualStdErr: number;
};

const VALID_LN_THRESHOLD = 1e-9;

function uniqueValues(rows: CompRow[], key: keyof CompRow): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'string' && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}

/**
 * Solve a symmetric positive-definite linear system A·x = b in-place.
 * Uses Gauss-Jordan with partial pivoting — adequate for small p
 * (we expect p ≤ 30 with realistic dummy counts). Throws on
 * singularity, which the caller handles by widening the comp set.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i += 1) {
    // Pivot
    let pivot = i;
    let maxAbs = Math.abs(M[i]![i] ?? 0);
    for (let k = i + 1; k < n; k += 1) {
      if (Math.abs(M[k]![i] ?? 0) > maxAbs) {
        pivot = k;
        maxAbs = Math.abs(M[k]![i] ?? 0);
      }
    }
    if (maxAbs < 1e-12) {
      throw new Error('Singular system — design matrix likely rank-deficient');
    }
    if (pivot !== i) {
      const tmp = M[i]!;
      M[i] = M[pivot]!;
      M[pivot] = tmp;
    }
    // Eliminate
    const piv = M[i]![i]!;
    for (let k = 0; k < n; k += 1) {
      if (k === i) continue;
      const factor = M[k]![i]! / piv;
      if (factor === 0) continue;
      for (let j = i; j <= n; j += 1) {
        M[k]![j]! -= factor * M[i]![j]!;
      }
    }
  }
  const x = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    x[i] = M[i]![n]! / M[i]![i]!;
  }
  return x;
}

function buildDesignRow(
  query: HedonicQuery,
  vintageMean: number,
  includeVintage: boolean,
  submarkets: string[],
  tiers: string[],
  dealStructures: string[]
): number[] {
  const row: number[] = [1, Math.log(query.sizeSqm)]; // intercept + ln(size)
  if (includeVintage) {
    const vintageDelta =
      typeof query.vintageYear === 'number' ? query.vintageYear - vintageMean : 0;
    row.push(vintageDelta);
  }
  // submarket dummies — drop first as reference category
  for (let i = 1; i < submarkets.length; i += 1) {
    row.push(query.submarket === submarkets[i] ? 1 : 0);
  }
  for (let i = 1; i < tiers.length; i += 1) {
    row.push(query.tier === tiers[i] ? 1 : 0);
  }
  for (let i = 1; i < dealStructures.length; i += 1) {
    row.push(query.dealStructure === dealStructures[i] ? 1 : 0);
  }
  return row;
}

function buildFeatureNames(
  includeVintage: boolean,
  submarkets: string[],
  tiers: string[],
  dealStructures: string[]
): string[] {
  const names: string[] = ['intercept', 'ln_size'];
  if (includeVintage) names.push('vintage_delta');
  for (let i = 1; i < submarkets.length; i += 1) names.push(`submarket=${submarkets[i]}`);
  for (let i = 1; i < tiers.length; i += 1) names.push(`tier=${tiers[i]}`);
  for (let i = 1; i < dealStructures.length; i += 1) names.push(`dealStructure=${dealStructures[i]}`);
  return names;
}

/**
 * Fit the hedonic regression on `comps` and produce the predicted
 * log-price for `query`.  Returns null when the comp set is too
 * thin to fit (fewer rows than parameters or zero variance in y).
 */
export function fitHedonic(
  comps: CompRow[],
  query: HedonicQuery
): HedonicFit | null {
  // Filter to rows with enough info.
  const valid = comps.filter(
    (r) =>
      r.pricePerSqmKrw > VALID_LN_THRESHOLD &&
      typeof r.sizeSqm === 'number' &&
      r.sizeSqm > VALID_LN_THRESHOLD
  );
  if (valid.length === 0) return null;

  const submarkets = uniqueValues(valid, 'submarket');
  if (submarkets.length === 0) submarkets.push('UNKNOWN');
  const tiers = uniqueValues(valid, 'tier');
  if (tiers.length === 0) tiers.push('UNKNOWN');
  const dealStructures = uniqueValues(valid, 'dealStructure');
  if (dealStructures.length === 0) dealStructures.push('UNKNOWN');

  const vintageVals = valid
    .map((r) => r.vintageYear)
    .filter((v): v is number => typeof v === 'number');
  const vintageMean =
    vintageVals.length === 0
      ? new Date().getFullYear()
      : vintageVals.reduce((s, v) => s + v, 0) / vintageVals.length;
  // Detect whether vintage carries any signal — if all rows have the
  // same year (or none have a year), the delta column is identically
  // zero and would make XᵀX singular. Skip it in that case.
  const includeVintage =
    vintageVals.length >= 2 &&
    vintageVals.some((v) => v !== vintageVals[0]);

  // Build X (n × p) and y.
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of valid) {
    const row = buildDesignRow(
      {
        sizeSqm: r.sizeSqm!,
        vintageYear: r.vintageYear ?? undefined,
        submarket: r.submarket ?? 'UNKNOWN',
        tier: r.tier ?? 'UNKNOWN',
        dealStructure: r.dealStructure ?? 'UNKNOWN'
      },
      vintageMean,
      includeVintage,
      submarkets,
      tiers,
      dealStructures
    );
    X.push(row);
    y.push(Math.log(r.pricePerSqmKrw));
  }

  const n = X.length;
  const p = X[0]!.length;
  if (n < p + 1) return null;

  // Compute XᵀX and Xᵀy.
  const XtX: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < p; j += 1) {
      Xty[j] += X[i]![j]! * y[i]!;
      for (let k = j; k < p; k += 1) {
        XtX[j]![k]! += X[i]![j]! * X[i]![k]!;
      }
    }
  }
  // Symmetrise
  for (let j = 0; j < p; j += 1) {
    for (let k = 0; k < j; k += 1) {
      XtX[j]![k] = XtX[k]![j]!;
    }
  }

  let beta: number[];
  try {
    beta = solveLinearSystem(XtX, Xty);
  } catch {
    return null;
  }

  // Fitted, residuals, R²
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    let yhat = 0;
    for (let j = 0; j < p; j += 1) yhat += X[i]![j]! * beta[j]!;
    const r = y[i]! - yhat;
    ssRes += r * r;
    const tot = y[i]! - yMean;
    ssTot += tot * tot;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const adjusted =
    n - p > 0 && ssTot > 0
      ? 1 - ((1 - rSquared) * (n - 1)) / (n - p)
      : rSquared;
  const residualStdErr = n - p > 0 ? Math.sqrt(ssRes / (n - p)) : 0;

  // Predict at query
  const queryRow = buildDesignRow(
    {
      sizeSqm: query.sizeSqm,
      vintageYear: query.vintageYear,
      submarket: query.submarket ?? 'UNKNOWN',
      tier: query.tier ?? 'UNKNOWN',
      dealStructure: query.dealStructure ?? 'UNKNOWN'
    },
    vintageMean,
    includeVintage,
    submarkets,
    tiers,
    dealStructures
  );
  let fittedLog = 0;
  for (let j = 0; j < p; j += 1) fittedLog += queryRow[j]! * beta[j]!;

  // Build coefficient dictionary
  const featureNames = buildFeatureNames(includeVintage, submarkets, tiers, dealStructures);
  const coefficients: Record<string, number> = {};
  for (let j = 0; j < p; j += 1) coefficients[featureNames[j]!] = beta[j]!;

  return {
    coefficients,
    fittedLogPricePerSqm: fittedLog,
    fittedPricePerSqmKrw: Math.exp(fittedLog),
    rSquared,
    adjustedRSquared: adjusted,
    n,
    p,
    residualStdErr
  };
}
