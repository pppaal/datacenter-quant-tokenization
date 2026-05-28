/**
 * Quantitative comparable-sale ADJUSTMENTS for the sales-comparison
 * approach (거래사례비교법).
 *
 * Background
 * ----------
 * The original implementation only *weighted* comps by similarity (area /
 * recency / market) and then took a weighted average of their RAW price/sqm.
 * That under-prices the core failure of the comparison approach: a comp that
 * is twice the subject's size, or three years stale, or in a cheaper
 * submarket, carries a price/sqm that is *systematically* different from what
 * the subject would trade at. Weighting it down does not remove that bias — it
 * only shrinks it. The appraisal-correct move (감정평가 시점·요인·개별 보정) is
 * to ADJUST each comp's price/sqm onto the subject's characteristics FIRST,
 * then weight the adjusted values.
 *
 * This module computes, per comp:
 *   adjustedPricePerSqm = rawPricePerSqm
 *       × (1 + timeAdj)        // 시점수정  — market movement comp date → val date
 *       × (1 + sizeAdj)        // 규모보정  — economies of scale
 *       × (1 + locationAdj)    // 지역/개별요인 — submarket / region tier
 * and returns the per-factor breakdown so the report can render
 *   "comp → adjustments → adjusted value".
 *
 * Every coefficient below is intentionally conservative and clamped. A wild
 * comp cannot explode the reconciled value because each factor and the total
 * are bounded.
 */

// ---------------------------------------------------------------------------
// Bounds — clamp every adjustment so one bad comp can't dominate.
// ---------------------------------------------------------------------------

/** Max absolute single-factor adjustment (±). 35% is already aggressive for
 * one dimension; beyond that the comp is too dissimilar to trust. */
export const MAX_FACTOR_ADJUSTMENT_PCT = 35;

/** Max absolute *net* (compounded) adjustment across all factors. Even if every
 * factor pegs at its bound, the adjusted price stays within ±60% of raw. */
export const MAX_NET_ADJUSTMENT_PCT = 60;

function clampPct(pct: number, bound: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(-bound, Math.min(bound, pct));
}

// ---------------------------------------------------------------------------
// Time adjustment (시점수정)
// ---------------------------------------------------------------------------

/**
 * Default annual capital-value growth used when no market index/growth signal
 * is supplied. 2.5%/yr is a deliberately modest KR commercial RE nominal
 * appreciation assumption — below historical Seoul prime so we never *inflate*
 * stale comps optimistically. Documented as a default, overridable by a real
 * `annualPriceGrowthPct` signal derived from MarketIndicatorSeries.
 */
export const DEFAULT_ANNUAL_PRICE_GROWTH_PCT = 2.5;

/** Cap the effective annual growth used for time-adjustment so a noisy index
 * spike can't compound into an absurd uplift on a very old comp. */
export const MAX_ANNUAL_GROWTH_PCT = 12;

export type TimeAdjustmentInput = {
  /** Comp transaction date. Null ⇒ no time adjustment (0%). */
  transactionDate: Date | null;
  /** Valuation "as-of" date (subject). */
  valuationDate: Date;
  /** Real annual price-growth signal (%/yr) if available, else null ⇒ default. */
  annualPriceGrowthPct: number | null;
};

export function computeTimeAdjustmentPct(input: TimeAdjustmentInput): {
  pct: number;
  yearsElapsed: number;
  annualGrowthUsedPct: number;
  usedDefault: boolean;
} {
  const { transactionDate, valuationDate } = input;
  if (!transactionDate || Number.isNaN(transactionDate.getTime())) {
    return { pct: 0, yearsElapsed: 0, annualGrowthUsedPct: 0, usedDefault: false };
  }
  const usedDefault = input.annualPriceGrowthPct === null;
  const rawGrowth = usedDefault ? DEFAULT_ANNUAL_PRICE_GROWTH_PCT : input.annualPriceGrowthPct!;
  // Clamp the growth rate itself before compounding.
  const annualGrowthUsedPct = Math.max(
    -MAX_ANNUAL_GROWTH_PCT,
    Math.min(MAX_ANNUAL_GROWTH_PCT, rawGrowth)
  );

  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  // Positive ⇒ comp is in the past and must be brought FORWARD to val date.
  const yearsElapsed = (valuationDate.getTime() - transactionDate.getTime()) / msPerYear;

  // Compound growth comp→val: (1+g)^years − 1.
  const factor = Math.pow(1 + annualGrowthUsedPct / 100, yearsElapsed) - 1;
  return {
    pct: clampPct(factor * 100, MAX_FACTOR_ADJUSTMENT_PCT),
    yearsElapsed: Number(yearsElapsed.toFixed(2)),
    annualGrowthUsedPct: Number(annualGrowthUsedPct.toFixed(2)),
    usedDefault
  };
}

// ---------------------------------------------------------------------------
// Size adjustment (규모보정 — economies of scale)
// ---------------------------------------------------------------------------

/**
 * Economies of scale: larger income-producing assets typically trade at a
 * LOWER price/sqm (bulk land, shared core, fewer marginal buyers for very large
 * lots, harder financing). We model this with a constant-elasticity (log-log)
 * relationship:
 *
 *   pricePerSqm ∝ area^(−SIZE_ELASTICITY)
 *
 * The size adjustment is the correction APPLIED TO THE COMP's price/sqm to
 * remove its size-driven bias and bring it onto the subject. A comp that is
 * LARGER than the subject is intrinsically a *low* price/sqm sale relative to
 * an asset of the subject's size — but we are correcting the comp for the fact
 * that *its size makes it cheap*, so to make it represent the subject's value
 * we move it the way the size premium says: a larger comp gets a DOWNWARD
 * adjustment (it should look even cheaper to reflect its scale discount when
 * read as a per-sqm rate that already over-states the subject), a smaller comp
 * gets an UPWARD adjustment.
 *
 *   sizeAdjPct = −(SIZE_ELASTICITY) × ln(A_c / A_s) × 100   (clamped)
 *
 * Intuition check with elasticity 0.10:
 *   - comp 2× larger (A_c/A_s = 2)  → −0.10·ln(2)·100 ≈ −6.93%  (DOWNWARD).
 *   - comp 0.5× (A_c/A_s = 0.5)     → −0.10·ln(0.5)·100 ≈ +6.93% (UPWARD).
 *   - comp same size                → 0%.
 *
 * Using the log form makes the adjustment symmetric in opposite directions
 * (2× and ½× give equal-and-opposite %), which is cleaner to audit than the
 * raw power form. Elasticity 0.10 is intentionally small/conservative —
 * empirical KR commercial size discounts are modest and noisy. Clamped to
 * ±MAX_FACTOR.
 */
export const SIZE_ELASTICITY = 0.1;

export function computeSizeAdjustmentPct(
  subjectAreaSqm: number,
  compAreaSqm: number | null
): { pct: number; areaRatio: number | null } {
  if (!compAreaSqm || compAreaSqm <= 0 || subjectAreaSqm <= 0) {
    return { pct: 0, areaRatio: null };
  }
  const areaRatio = compAreaSqm / subjectAreaSqm;
  // −elasticity·ln(comp/subject)·100.  comp larger ⇒ ln>0 ⇒ negative (downward).
  // `+ 0` normalizes the −0 that ln(1) would otherwise produce.
  const factor = -SIZE_ELASTICITY * Math.log(areaRatio) + 0;
  return {
    pct: clampPct(factor * 100, MAX_FACTOR_ADJUSTMENT_PCT),
    areaRatio: Number(areaRatio.toFixed(3))
  };
}

// ---------------------------------------------------------------------------
// Location / submarket adjustment (지역요인 보정)
// ---------------------------------------------------------------------------

/**
 * Location adjustment corrects for the comp sitting in a different
 * market/submarket than the subject. We only have categorical signals
 * (market code, region/province string), so we use a small, transparent tier
 * ladder rather than a fake continuous coefficient:
 *
 *   - same market AND region contains subject province → 0% (no correction)
 *   - same market, different region                    → ±LOCATION_REGION_PCT,
 *       direction unknown ⇒ conservatively 0 (we cannot say which is pricier)
 *   - different market                                 → 0 with a flag (comp is
 *       weak; weighting already penalizes it)
 *
 * Where a real relative-price signal is provided (subjectVsCompPriceLevelPct,
 * e.g. submarket land-price index ratio), we apply it directly, clamped.
 *
 * Rationale: inventing a directional location premium from a string we can't
 * rank would be the kind of "wild comp explosion" the task warns against. We
 * keep location conservative and lean on the explicit signal when present.
 */
export const LOCATION_MISMATCH_FLAG_PCT = 0; // categorical mismatch ⇒ no blind uplift

export type LocationAdjustmentInput = {
  compMarket: string | null;
  compRegion: string | null;
  subjectMarket: string;
  subjectProvince: string | null;
  /**
   * Optional explicit relative price-level signal: how much higher (+) or
   * lower (−), in %, the SUBJECT submarket prices vs the COMP submarket. When
   * present this drives the adjustment directly (clamped). Null ⇒ categorical.
   */
  subjectVsCompPriceLevelPct: number | null;
};

export function computeLocationAdjustmentPct(input: LocationAdjustmentInput): {
  pct: number;
  basis: 'signal' | 'same-submarket' | 'same-market' | 'cross-market' | 'unknown';
} {
  if (
    input.subjectVsCompPriceLevelPct !== null &&
    Number.isFinite(input.subjectVsCompPriceLevelPct)
  ) {
    return {
      pct: clampPct(input.subjectVsCompPriceLevelPct, MAX_FACTOR_ADJUSTMENT_PCT),
      basis: 'signal'
    };
  }
  if (!input.compMarket) return { pct: 0, basis: 'unknown' };
  if (input.compMarket === input.subjectMarket) {
    if (
      input.compRegion &&
      input.subjectProvince &&
      input.compRegion.includes(input.subjectProvince)
    ) {
      return { pct: 0, basis: 'same-submarket' };
    }
    return { pct: LOCATION_MISMATCH_FLAG_PCT, basis: 'same-market' };
  }
  return { pct: LOCATION_MISMATCH_FLAG_PCT, basis: 'cross-market' };
}

// ---------------------------------------------------------------------------
// Per-comp adjustment assembly
// ---------------------------------------------------------------------------

export type CompAdjustmentFactor = {
  factor: 'time' | 'size' | 'location';
  labelKo: string;
  pct: number;
  note: string;
};

export type AdjustedComp = {
  rawPricePerSqmKrw: number;
  adjustedPricePerSqmKrw: number;
  /** Net compounded adjustment %, clamped to MAX_NET_ADJUSTMENT_PCT. */
  netAdjustmentPct: number;
  /** True when the net compounded adjustment hit the net clamp. */
  netClamped: boolean;
  factors: CompAdjustmentFactor[];
};

export type AdjustCompInput = {
  rawPricePerSqmKrw: number;
  compAreaSqm: number | null;
  subjectAreaSqm: number;
  transactionDate: Date | null;
  valuationDate: Date;
  annualPriceGrowthPct: number | null;
  compMarket: string | null;
  compRegion: string | null;
  subjectMarket: string;
  subjectProvince: string | null;
  subjectVsCompPriceLevelPct: number | null;
};

export function adjustComp(input: AdjustCompInput): AdjustedComp {
  const time = computeTimeAdjustmentPct({
    transactionDate: input.transactionDate,
    valuationDate: input.valuationDate,
    annualPriceGrowthPct: input.annualPriceGrowthPct
  });
  const size = computeSizeAdjustmentPct(input.subjectAreaSqm, input.compAreaSqm);
  const location = computeLocationAdjustmentPct({
    compMarket: input.compMarket,
    compRegion: input.compRegion,
    subjectMarket: input.subjectMarket,
    subjectProvince: input.subjectProvince,
    subjectVsCompPriceLevelPct: input.subjectVsCompPriceLevelPct
  });

  const factors: CompAdjustmentFactor[] = [
    {
      factor: 'time',
      labelKo: '시점수정',
      pct: Number(time.pct.toFixed(2)),
      note: time.usedDefault
        ? `default ${time.annualGrowthUsedPct}%/yr × ${time.yearsElapsed}y`
        : `index ${time.annualGrowthUsedPct}%/yr × ${time.yearsElapsed}y`
    },
    {
      factor: 'size',
      labelKo: '규모보정',
      pct: Number(size.pct.toFixed(2)),
      note:
        size.areaRatio === null
          ? 'no comp area — neutral'
          : `area ratio ${size.areaRatio}× ^${SIZE_ELASTICITY}`
    },
    {
      factor: 'location',
      labelKo: '지역요인',
      pct: Number(location.pct.toFixed(2)),
      note: location.basis
    }
  ];

  // Compound the clamped per-factor adjustments.
  const rawNetFactor = (1 + time.pct / 100) * (1 + size.pct / 100) * (1 + location.pct / 100) - 1;
  const netClamped = Math.abs(rawNetFactor * 100) > MAX_NET_ADJUSTMENT_PCT;
  const netAdjustmentPct = clampPct(rawNetFactor * 100, MAX_NET_ADJUSTMENT_PCT);

  const adjustedPricePerSqmKrw = input.rawPricePerSqmKrw * (1 + netAdjustmentPct / 100);

  return {
    rawPricePerSqmKrw: input.rawPricePerSqmKrw,
    adjustedPricePerSqmKrw,
    netAdjustmentPct: Number(netAdjustmentPct.toFixed(2)),
    netClamped,
    factors
  };
}

// ---------------------------------------------------------------------------
// Hedonic OLS (optional, only on a sufficiently large comp set)
// ---------------------------------------------------------------------------

/**
 * Minimum number of usable comps before we trust a hedonic regression. With
 * two predictors (log-area, age-years) plus intercept we need a comfortable
 * margin over the 3 parameters to avoid overfitting a tiny sample, hence 8.
 * Below this we fall back to the transparent factor adjustments above.
 */
export const HEDONIC_MIN_COMPS = 8;

export type HedonicSample = {
  pricePerSqmKrw: number;
  areaSqm: number;
  ageYears: number; // years from comp date to valuation date
};

export type HedonicFit = {
  intercept: number;
  betaLogArea: number;
  betaAge: number;
  n: number;
  r2: number;
};

/**
 * Ordinary least squares of ln(pricePerSqm) on [1, ln(area), ageYears].
 * Pure, dependency-free 3-variable normal-equation solve. Returns null when
 * the sample is too small or the design matrix is singular/degenerate (e.g.
 * zero variance in a predictor) — caller then uses factor adjustments.
 */
export function fitHedonic(samples: HedonicSample[]): HedonicFit | null {
  const usable = samples.filter(
    (s) => s.pricePerSqmKrw > 0 && s.areaSqm > 0 && Number.isFinite(s.ageYears)
  );
  if (usable.length < HEDONIC_MIN_COMPS) return null;

  const n = usable.length;
  const X = usable.map((s) => [1, Math.log(s.areaSqm), s.ageYears]);
  const y = usable.map((s) => Math.log(s.pricePerSqmKrw));

  // Normal equations: (XᵀX) b = Xᵀy, 3×3 solved by Gaussian elimination.
  const XtX = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const Xty = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < 3; b++) {
        XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
      }
    }
  }

  const solved = solve3x3(XtX, Xty);
  if (!solved) return null;
  const [intercept, betaLogArea, betaAge] = solved;

  // R² on the log scale.
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept! + betaLogArea! * X[i]![1]! + betaAge! * X[i]![2]!;
    ssTot += (y[i]! - yMean) ** 2;
    ssRes += (y[i]! - pred) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { intercept: intercept!, betaLogArea: betaLogArea!, betaAge: betaAge!, n, r2 };
}

function solve3x3(A: number[][], b: number[]): [number, number, number] | null {
  // Augmented matrix with partial pivoting.
  const m = [
    [A[0]![0]!, A[0]![1]!, A[0]![2]!, b[0]!],
    [A[1]![0]!, A[1]![1]!, A[1]![2]!, b[1]!],
    [A[2]![0]!, A[2]![1]!, A[2]![2]!, b[2]!]
  ];
  for (let col = 0; col < 3; col++) {
    // Pivot
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null; // singular
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    // Normalize + eliminate
    const pv = m[col]![col]!;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / pv;
      for (let c = col; c < 4; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return [m[0]![3]! / m[0]![0]!, m[1]![3]! / m[1]![1]!, m[2]![3]! / m[2]![2]!];
}

/**
 * Predict the subject's price/sqm from a fitted hedonic model. Returns null if
 * the prediction is non-finite. Caller should still sanity-check against the
 * factor-adjusted range.
 */
export function predictHedonic(
  fit: HedonicFit,
  subjectAreaSqm: number,
  subjectAgeYears: number
): number | null {
  if (subjectAreaSqm <= 0) return null;
  const lnPrice =
    fit.intercept + fit.betaLogArea * Math.log(subjectAreaSqm) + fit.betaAge * subjectAgeYears;
  const price = Math.exp(lnPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}
