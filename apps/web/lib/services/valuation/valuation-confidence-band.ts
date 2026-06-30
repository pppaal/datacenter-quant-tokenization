/**
 * Valuation CONFIDENCE BAND + comparable-quality score (benchmark #3).
 *
 * The report already ships (a) Monte-Carlo IRR/MOIC distributions — uncertainty in the
 * RETURN, and (b) a field-level data-quality panel — which INPUTS are live vs fallback.
 * It does NOT answer "how uncertain is the headline VALUE itself?" This builder fills
 * exactly that gap and nothing else:
 *
 *   - a low/base/high VALUE band whose half-width scales with comparable DISPERSION
 *     (coefficient of variation of comp cap rates) and widens when evidence coverage is
 *     thin, and
 *   - a comparable-quality classification (robust / fair / sparse) from count + dispersion.
 *
 * IMPORTANT — this is a transparent HEURISTIC band, not a statistical confidence interval
 * and not the Monte-Carlo return distribution. The half-width is a deterministic function
 * of comp dispersion + evidence coverage, surfaced so a reader can see how well-supported
 * the point estimate is. PURE and DB-free → fully unit-testable.
 */
import { clamp, round } from '@/lib/math';

/** Minimal structural shape of a comparable (matches `ComparableEntry` fields we use). */
export type ComparableLike = {
  capRatePct?: number | null;
  pricePerMwKrw?: number | null;
  valuationKrw?: number | null;
};

/** Minimal structural shape of the evidence-coverage signal (from `ValuationQualitySummary`). */
export type CoverageLike = {
  coverage?: Array<{ status: 'good' | 'warn' }> | null;
};

export type ComparableQuality = 'robust' | 'fair' | 'sparse';
export type ValuationConfidenceLabel = 'high' | 'medium' | 'low';

export type ValuationConfidenceBand = {
  baseValueKrw: number;
  lowValueKrw: number;
  highValueKrw: number;
  /** ± half-width as a fraction of base (e.g. 0.12 → ±12%). */
  bandHalfWidthPct: number;
  confidenceLabel: ValuationConfidenceLabel;
  comparableCount: number;
  comparableQuality: ComparableQuality;
  /** Coefficient of variation of usable comp cap rates; null when < 2 usable comps. */
  comparableDispersionCv: number | null;
  coverageWarnCount: number | null;
  coverageTotal: number | null;
  drivers: string[];
  method: string;
};

const BAND_FLOOR = 0.05; // ±5% minimum even with excellent support.
const BAND_CEIL = 0.35; // ±35% cap so the band stays decision-useful.
const NO_DISPERSION_DEFAULT = 0.2; // assumed dispersion when comps are too few to measure.
const MAX_COVERAGE_PENALTY = 0.15;
const SPARSE_COMP_PENALTY = 0.05;

function usableCapRates(comparables: ComparableLike[]): number[] {
  return comparables
    .map((c) => c.capRatePct)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

/** Sample (n−1) coefficient of variation; null when fewer than 2 points or mean ≤ 0. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

export function buildValuationConfidenceBand(params: {
  baseValueKrw: number;
  comparables: ComparableLike[];
  quality?: CoverageLike | null;
}): ValuationConfidenceBand {
  const { baseValueKrw } = params;
  const comparables = params.comparables ?? [];
  const comparableCount = comparables.length;

  const capRates = usableCapRates(comparables);
  const cvRaw = coefficientOfVariation(capRates);
  const comparableDispersionCv = cvRaw == null ? null : round(cvRaw, 4);

  const coverage = params.quality?.coverage ?? null;
  const coverageTotal = coverage ? coverage.length : null;
  const coverageWarnCount = coverage ? coverage.filter((c) => c.status === 'warn').length : null;

  // Dispersion component: measured CV (capped) or an elevated default when unmeasurable.
  const dispersionComponent = clamp(cvRaw ?? NO_DISPERSION_DEFAULT, 0, 0.3);
  // Coverage component: fraction of evidence items still in 'warn', scaled.
  const coveragePenalty =
    coverageTotal && coverageTotal > 0 && coverageWarnCount != null
      ? (coverageWarnCount / coverageTotal) * MAX_COVERAGE_PENALTY
      : 0;
  const countPenalty = comparableCount < 3 ? SPARSE_COMP_PENALTY : 0;

  const bandHalfWidthPct = round(
    clamp(
      Math.max(dispersionComponent, BAND_FLOOR) + coveragePenalty + countPenalty,
      BAND_FLOOR,
      BAND_CEIL
    ),
    4
  );

  const lowValueKrw =
    baseValueKrw > 0 ? Math.round(baseValueKrw * (1 - bandHalfWidthPct)) : baseValueKrw;
  const highValueKrw =
    baseValueKrw > 0 ? Math.round(baseValueKrw * (1 + bandHalfWidthPct)) : baseValueKrw;

  let comparableQuality: ComparableQuality;
  if (comparableCount >= 5 && comparableDispersionCv != null && comparableDispersionCv <= 0.1) {
    comparableQuality = 'robust';
  } else if (comparableCount >= 3) {
    comparableQuality = 'fair';
  } else {
    comparableQuality = 'sparse';
  }

  const coverageThin =
    coverageTotal != null &&
    coverageTotal > 0 &&
    coverageWarnCount != null &&
    coverageWarnCount / coverageTotal >= 0.66;

  let confidenceLabel: ValuationConfidenceLabel;
  if (comparableQuality === 'robust' && (coverageWarnCount == null || coverageWarnCount <= 1)) {
    confidenceLabel = 'high';
  } else if (comparableQuality === 'sparse' || coverageThin) {
    confidenceLabel = 'low';
  } else {
    confidenceLabel = 'medium';
  }

  const drivers: string[] = [];
  drivers.push(
    comparableDispersionCv != null
      ? `${comparableCount} comparables, cap-rate dispersion (CV) ${(comparableDispersionCv * 100).toFixed(1)}% → ${comparableQuality}.`
      : `${comparableCount} comparable(s) — too few to measure dispersion; band widened to a conservative default.`
  );
  if (countPenalty > 0) {
    drivers.push('Fewer than 3 comparables: band widened for thin pricing calibration.');
  }
  if (coverageTotal && coverageWarnCount != null) {
    drivers.push(
      `${coverageWarnCount}/${coverageTotal} evidence items still incomplete${coveragePenalty > 0 ? ` (band +${(coveragePenalty * 100).toFixed(1)}%)` : ''}.`
    );
  }

  return {
    baseValueKrw,
    lowValueKrw,
    highValueKrw,
    bandHalfWidthPct,
    confidenceLabel,
    comparableCount,
    comparableQuality,
    comparableDispersionCv,
    coverageWarnCount,
    coverageTotal,
    drivers,
    method:
      'Heuristic value-uncertainty band: ±half-width scales with comparable cap-rate dispersion (CV) and evidence-coverage gaps. Not a statistical confidence interval and distinct from the Monte-Carlo return distribution.'
  };
}
