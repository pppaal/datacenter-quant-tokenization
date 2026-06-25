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
 *   - Invert (XᵀX) once via Gauss-Jordan with partial pivoting, then
 *     β̂ = (XᵀX)⁻¹·Xᵀy.
 *   - Compute fitted value, residuals, R².
 *   - OLS inference per coefficient (2026-06 quant audit): the retained
 *     (XᵀX)⁻¹ gives Cov(β̂) = σ̂²·(XᵀX)⁻¹ with σ̂² = RSS/(n−k), so each
 *     coefficient carries a standard error, t-statistic, exact Student-t
 *     (df = n−k) two-sided p-value, and a VIF. A condition-number proxy
 *     + VIF gate flag near-singular designs (`wellConditioned: false`)
 *     so a deceptively high R² on collinear thin-market dummies is no
 *     longer silently trusted.
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

/**
 * Per-coefficient OLS inference. All fields are derived from the
 * closed-form OLS covariance Cov(β̂) = σ̂²·(XᵀX)⁻¹ with
 * σ̂² = RSS/(n−k) (k = number of fitted parameters; the residual
 * degrees of freedom are df = n−k). These are ADDITIVE — point
 * estimates remain on `HedonicFit.coefficients` for backwards
 * compatibility.
 */
export type CoefficientInference = {
  /** Point estimate β̂_j (same value as `coefficients[name]`). */
  estimate: number;
  /** Standard error SE_j = sqrt(σ̂²·(XᵀX)⁻¹_jj). `null` when df ≤ 0. */
  standardError: number | null;
  /** t-statistic β̂_j / SE_j. `null` when SE is unavailable / zero. */
  tStatistic: number | null;
  /**
   * Two-sided p-value Pr(|T_df| > |t|) under a Student-t with df = n−k.
   * `null` when the t-statistic is unavailable.
   */
  pValue: number | null;
  /**
   * Variance-inflation factor for this regressor (the intercept is
   * reported as `null`). VIF_j = (XᵀX)⁻¹_jj · S_jj, where S_jj is the
   * centred sum-of-squares of column j; a value ≥ `VIF_WARN_THRESHOLD`
   * flags problematic multicollinearity.
   */
  vif: number | null;
};

export type HedonicFit = {
  /** OLS coefficients keyed by feature name. */
  coefficients: Record<string, number>;
  /**
   * Per-coefficient OLS inference (SE / t / p / VIF) keyed by the same
   * feature names as `coefficients`. ADDITIVE — added by the 2026-06
   * quant audit; existing consumers can ignore it.
   */
  inference?: Record<string, CoefficientInference>;
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
  /**
   * Conditioning of the (XᵀX) normal-equations matrix. The condition
   * number is the ratio of the largest to the smallest pivot magnitude
   * encountered during Gauss-Jordan elimination — an O(1) proxy for the
   * true 2-norm condition number that is monotone in collinearity. When
   * it exceeds `CONDITION_NUMBER_WARN_THRESHOLD` (or any VIF exceeds
   * `VIF_WARN_THRESHOLD`), `wellConditioned` is `false`: a high R² on
   * such a fit reflects near-singular, unstable coefficients and must
   * not be trusted in due diligence.
   */
  conditionNumber?: number;
  /** `false` when the design is near-singular beyond a documented threshold. */
  wellConditioned?: boolean;
  /** Human-readable conditioning warnings (empty when well conditioned). */
  warnings?: string[];
};

const VALID_LN_THRESHOLD = 1e-9;

/**
 * Condition-number proxy above which the (XᵀX) matrix is treated as
 * near-singular. 1e8 ≈ losing half of double precision's ~16 significant
 * digits to error propagation — a standard rule-of-thumb cutoff for an
 * ill-conditioned normal-equations solve. (Because XᵀX squares the
 * design's condition number, this corresponds to a design-matrix
 * condition number of ~1e4.)
 */
const CONDITION_NUMBER_WARN_THRESHOLD = 1e8;

/**
 * VIF above which a regressor is flagged as multicollinear. 10 is the
 * textbook threshold (Kutner et al.); it corresponds to R²_j > 0.9 of
 * column j regressed on the other regressors.
 */
const VIF_WARN_THRESHOLD = 10;

function uniqueValues(rows: CompRow[], key: keyof CompRow): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'string' && v.length > 0) set.add(v);
  }
  return Array.from(set).sort();
}

/**
 * Invert a symmetric positive-definite matrix `A` (here XᵀX) via
 * Gauss-Jordan elimination with partial pivoting, AND return the
 * conditioning proxy in the same pass.
 *
 * We need the full inverse (not just the solve) because OLS inference
 * requires (XᵀX)⁻¹: Cov(β̂) = σ̂²·(XᵀX)⁻¹, so SE_j = sqrt(σ̂²·(XᵀX)⁻¹_jj).
 * The original `solveLinearSystem` computed and discarded this — hence
 * the audit finding that the model shipped point estimates with no
 * defensible standard errors.
 *
 * The `conditionNumber` returned is max|pivot| / min|pivot| over the
 * elimination. For an SPD matrix reduced with partial pivoting this is
 * a cheap, monotone-in-collinearity proxy for the true 2-norm condition
 * number κ₂(A) — it does not equal κ₂ exactly, but a near-singular
 * (collinear-dummy) design drives a tiny final pivot and therefore a
 * large ratio, which is exactly the signal we want to surface.
 *
 * Throws on exact singularity (pivot < 1e-12) — matching the previous
 * behaviour so the caller still falls back to `null`.
 */
function invertSymmetric(A: number[][]): { inverse: number[][]; conditionNumber: number } {
  const n = A.length;
  // Augment [A | I] and reduce the left block to I; the right block
  // becomes A⁻¹.
  const M: number[][] = A.map((row, i) => {
    const ident = new Array<number>(n).fill(0);
    ident[i] = 1;
    return [...row, ...ident];
  });
  let maxPivot = 0;
  let minPivot = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    // Partial pivot on column i.
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
    if (maxAbs > maxPivot) maxPivot = maxAbs;
    if (maxAbs < minPivot) minPivot = maxAbs;
    if (pivot !== i) {
      const tmp = M[i]!;
      M[i] = M[pivot]!;
      M[pivot] = tmp;
    }
    const piv = M[i]![i]!;
    // Normalise pivot row.
    for (let j = 0; j < 2 * n; j += 1) {
      M[i]![j]! /= piv;
    }
    // Eliminate column i from all other rows.
    for (let k = 0; k < n; k += 1) {
      if (k === i) continue;
      const factor = M[k]![i]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) {
        M[k]![j]! -= factor * M[i]![j]!;
      }
    }
  }
  const inverse: number[][] = M.map((row) => row.slice(n));
  const conditionNumber = minPivot > 0 ? maxPivot / minPivot : Number.POSITIVE_INFINITY;
  return { inverse, conditionNumber };
}

/**
 * Regularised lower incomplete beta function I_x(a, b) via the
 * Lentz continued-fraction expansion (Numerical Recipes §6.4). Used
 * only to evaluate the Student-t CDF below. Converges to ~1e-12 in a
 * few dozen iterations for the (a, b) ranges we hit (a = df/2, b = 1/2).
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  // Continued fraction for the symmetric tail that converges fastest.
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaContinuedFraction(x, a, b);
  }
  return 1 - regularizedIncompleteBeta(1 - x, b, a);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const TINY = 1e-30;
  const MAX_ITER = 300;
  const EPS = 1e-14;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m += 1) {
    const m2 = 2 * m;
    // Even step.
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    // Odd step.
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Lanczos approximation of ln Γ(z) (accurate to ~1e-13 for z > 0). */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    // Reflection formula.
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zz = z - 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i += 1) {
    x += c[i]! / (zz + i);
  }
  const t = zz + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Two-sided p-value Pr(|T_df| > |t|) for a Student-t with `df` degrees
 * of freedom. Computed exactly (to numeric precision) from the
 * regularised incomplete beta: Pr(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2).
 * df = n − k throughout (k = number of fitted parameters). We use the
 * exact t-distribution rather than a normal approximation because KR
 * comp sets are routinely thin (df well under 30), where the normal
 * understates the tails.
 */
function twoSidedTPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

/** Multiply a p×p matrix by a length-p vector. */
function matVec(A: number[][], v: number[]): number[] {
  const p = A.length;
  const out = new Array<number>(p).fill(0);
  for (let i = 0; i < p; i += 1) {
    let s = 0;
    for (let j = 0; j < p; j += 1) s += A[i]![j]! * v[j]!;
    out[i] = s;
  }
  return out;
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
  for (let i = 1; i < dealStructures.length; i += 1)
    names.push(`dealStructure=${dealStructures[i]}`);
  return names;
}

/**
 * Fit the hedonic regression on `comps` and produce the predicted
 * log-price for `query`.  Returns null when the comp set is too
 * thin to fit (fewer rows than parameters or zero variance in y).
 */
export function fitHedonic(comps: CompRow[], query: HedonicQuery): HedonicFit | null {
  // Guard the query: the design row takes ln(query.sizeSqm), so a non-positive
  // or non-finite size yields -Infinity/NaN and silently corrupts the fitted
  // price (fittedPricePerSqmKrw → 0 / NaN). Treat it as un-fittable.
  if (typeof query.sizeSqm !== 'number' || !(query.sizeSqm > VALID_LN_THRESHOLD)) {
    return null;
  }

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
  const includeVintage = vintageVals.length >= 2 && vintageVals.some((v) => v !== vintageVals[0]);

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

  // Invert (XᵀX) once and reuse it for both the coefficient solve
  // (β̂ = (XᵀX)⁻¹·Xᵀy) and OLS inference (Cov(β̂) = σ̂²·(XᵀX)⁻¹). The
  // conditioning proxy comes out of the same factorisation.
  let inverse: number[][];
  let conditionNumber: number;
  try {
    ({ inverse, conditionNumber } = invertSymmetric(XtX));
  } catch {
    return null;
  }
  const beta = matVec(inverse, Xty);

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
  const adjusted = n - p > 0 && ssTot > 0 ? 1 - ((1 - rSquared) * (n - 1)) / (n - p) : rSquared;
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

  // OLS inference. df = n − k (k = p = number of fitted parameters).
  // σ̂² = RSS/df is the unbiased residual variance; Cov(β̂) = σ̂²·(XᵀX)⁻¹.
  const df = n - p;
  const sigma2 = df > 0 ? ssRes / df : Number.NaN;

  // Centred sum-of-squares per design column, S_jj = Σ(x_ij − x̄_j)², for
  // the VIF scaling. (For the intercept column this is ~0, so VIF is
  // reported as null there.)
  const colMean = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += X[i]![j]!;
    colMean[j] = s / n;
  }
  const colSS = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const d = X[i]![j]! - colMean[j]!;
      s += d * d;
    }
    colSS[j] = s;
  }

  let maxVif = 0;
  const inference: Record<string, CoefficientInference> = {};
  for (let j = 0; j < p; j += 1) {
    const name = featureNames[j]!;
    const invJj = inverse[j]![j]!;
    const variance = Number.isFinite(sigma2) ? sigma2 * invJj : Number.NaN;
    const standardError = Number.isFinite(variance) && variance >= 0 ? Math.sqrt(variance) : null;
    const tStatistic =
      standardError !== null && standardError > 0 ? beta[j]! / standardError : null;
    const pValue = tStatistic !== null ? twoSidedTPValue(tStatistic, df) : null;
    // The intercept's centred SS is ~0, so a VIF is undefined for it.
    const isIntercept = name === 'intercept';
    const vif = !isIntercept && colSS[j]! > VALID_LN_THRESHOLD ? invJj * colSS[j]! : null;
    if (vif !== null && Number.isFinite(vif) && vif > maxVif) maxVif = vif;
    inference[name] = {
      estimate: beta[j]!,
      standardError,
      tStatistic,
      pValue: pValue !== null && Number.isFinite(pValue) ? pValue : null,
      vif: vif !== null && Number.isFinite(vif) ? vif : null
    };
  }

  // Conditioning guard. A high R² on a near-singular design hides
  // unstable coefficients; surface it rather than silently trusting it.
  const warnings: string[] = [];
  const conditionBad =
    !Number.isFinite(conditionNumber) || conditionNumber > CONDITION_NUMBER_WARN_THRESHOLD;
  const vifBad = maxVif >= VIF_WARN_THRESHOLD;
  if (conditionBad) {
    warnings.push(
      `Ill-conditioned design: condition-number proxy ${conditionNumber.toExponential(2)} exceeds ${CONDITION_NUMBER_WARN_THRESHOLD.toExponential(0)}. Coefficients are numerically unstable; widen the comp set.`
    );
  }
  if (vifBad) {
    warnings.push(
      `Multicollinearity: max VIF ${maxVif.toFixed(1)} ≥ ${VIF_WARN_THRESHOLD}. One or more regressors are near-collinear; coefficient SEs are inflated.`
    );
  }
  const wellConditioned = !conditionBad && !vifBad;

  return {
    coefficients,
    inference,
    fittedLogPricePerSqm: fittedLog,
    fittedPricePerSqmKrw: Math.exp(fittedLog),
    rSquared,
    adjustedRSquared: adjusted,
    n,
    p,
    residualStdErr,
    conditionNumber,
    wellConditioned,
    warnings
  };
}
