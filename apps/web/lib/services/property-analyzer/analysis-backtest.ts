/**
 * Calibration / realized-price backtest for persisted property analyses.
 *
 * Compares the value an analysis PREDICTED (`baseCaseValueKrw`, plus the
 * report's base exit cap rate) against the price that was actually realized in
 * the market, grouped BY asset class and BY prediction vintage (year).
 *
 * Strict point-in-time separation: a prediction is only ever compared to a
 * realized observation dated STRICTLY AFTER the prediction date. A realized
 * price observed before (or at) the analysis date is look-ahead-free noise and
 * is excluded — you cannot "predict" a price you already saw.
 *
 * Metrics per group:
 *   - MAPE  : mean( |predicted - realized| / |realized| ) × 100
 *   - mean bias (signed) : mean( (predicted - realized) / realized ) × 100
 *               positive ⇒ the engine systematically over-values
 *   - cap-rate residual  : mean( predictedExitCapPct - realizedExitCapPct )
 *
 * This deliberately mirrors the existing `ValuationRun`-based backtest in
 * `forecast/realized-backtest.ts` (point-in-time training/eval, MAPE) but
 * targets the ad-hoc analysis snapshots, which are keyed by PNU rather than a
 * managed `assetId`. The functions are pure and DB-free so they unit-test
 * against fixtures; a thin DB adapter feeds them from Prisma.
 */

import type { AssetClass } from '@prisma/client';

/** A prediction produced by a persisted analysis snapshot. */
export type AnalysisPrediction = {
  snapshotId: string;
  pnu: string;
  assetClass: AssetClass;
  /** When the analysis was produced (the prediction date). */
  predictedAt: Date;
  /** Headline base-case value the analysis priced the parcel at. */
  predictedValueKrw: number;
  /** Base-case exit cap rate (%), when the report exposed one. */
  predictedExitCapRatePct: number | null;
};

/** A realized market price observation for a parcel. */
export type RealizedPriceObservation = {
  pnu: string;
  observedAt: Date;
  realizedValueKrw: number;
  realizedExitCapRatePct: number | null;
};

export type BacktestPoint = {
  snapshotId: string;
  pnu: string;
  assetClass: AssetClass;
  /** Prediction vintage = calendar year of `predictedAt` (UTC). */
  vintageYear: number;
  predictedAt: string;
  observedAt: string;
  horizonDays: number;
  predictedValueKrw: number;
  realizedValueKrw: number;
  /** signed percentage error: (predicted - realized) / realized × 100. */
  errorPct: number;
  absErrorPct: number;
  capRateResidualPct: number | null;
};

export type BacktestMetrics = {
  count: number;
  /** Mean absolute percentage error (%), null when no points. */
  mapePct: number | null;
  /** Mean signed bias (%); >0 ⇒ engine over-values, null when no points. */
  meanBiasPct: number | null;
  /** Mean cap-rate residual (predicted - realized, pp); null when none. */
  meanCapRateResidualPct: number | null;
};

export type BacktestGroup = BacktestMetrics & {
  key: string;
  points: BacktestPoint[];
};

export type AnalysisBacktestResult = {
  overall: BacktestMetrics;
  byAssetClass: BacktestGroup[];
  byVintage: BacktestGroup[];
  byAssetClassAndVintage: BacktestGroup[];
  points: BacktestPoint[];
};

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function differenceInDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * For a single prediction, pick the EARLIEST realized observation dated
 * strictly after the prediction (point-in-time separation). Picking the
 * earliest keeps the comparison horizon as tight as possible and avoids
 * silently rewarding the model for a much-later, regime-shifted price.
 */
export function selectRealizedAfterPrediction(
  prediction: AnalysisPrediction,
  observations: RealizedPriceObservation[]
): RealizedPriceObservation | null {
  const future = observations
    .filter((obs) => obs.pnu === prediction.pnu)
    .filter((obs) => obs.observedAt.getTime() > prediction.predictedAt.getTime())
    .filter((obs) => Number.isFinite(obs.realizedValueKrw) && obs.realizedValueKrw > 0)
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  return future[0] ?? null;
}

function computeMetrics(points: BacktestPoint[]): BacktestMetrics {
  if (points.length === 0) {
    return { count: 0, mapePct: null, meanBiasPct: null, meanCapRateResidualPct: null };
  }
  const mape = mean(points.map((p) => p.absErrorPct));
  const bias = mean(points.map((p) => p.errorPct));
  const capResiduals = points
    .map((p) => p.capRateResidualPct)
    .filter((value): value is number => value !== null);
  const capResidual = mean(capResiduals);
  return {
    count: points.length,
    mapePct: mape === null ? null : round(mape),
    meanBiasPct: bias === null ? null : round(bias),
    meanCapRateResidualPct: capResidual === null ? null : round(capResidual)
  };
}

function groupBy(points: BacktestPoint[], keyOf: (p: BacktestPoint) => string): BacktestGroup[] {
  const groups = new Map<string, BacktestPoint[]>();
  for (const point of points) {
    const key = keyOf(point);
    const bucket = groups.get(key) ?? [];
    bucket.push(point);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, bucketPoints]) => ({ key, points: bucketPoints, ...computeMetrics(bucketPoints) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Core backtest. Pure: takes predictions + realized observations, applies
 * point-in-time matching, and returns metrics grouped by asset class and
 * vintage. DB-free.
 */
export function buildAnalysisBacktest({
  predictions,
  observations
}: {
  predictions: AnalysisPrediction[];
  observations: RealizedPriceObservation[];
}): AnalysisBacktestResult {
  const points: BacktestPoint[] = [];

  for (const prediction of predictions) {
    if (!Number.isFinite(prediction.predictedValueKrw) || prediction.predictedValueKrw <= 0) {
      continue;
    }
    const realized = selectRealizedAfterPrediction(prediction, observations);
    if (!realized) continue;

    const errorPct =
      ((prediction.predictedValueKrw - realized.realizedValueKrw) / realized.realizedValueKrw) *
      100;
    const capRateResidualPct =
      prediction.predictedExitCapRatePct !== null &&
      realized.realizedExitCapRatePct !== null &&
      realized.realizedExitCapRatePct !== undefined
        ? round(prediction.predictedExitCapRatePct - realized.realizedExitCapRatePct)
        : null;

    points.push({
      snapshotId: prediction.snapshotId,
      pnu: prediction.pnu,
      assetClass: prediction.assetClass,
      vintageYear: prediction.predictedAt.getUTCFullYear(),
      predictedAt: prediction.predictedAt.toISOString(),
      observedAt: realized.observedAt.toISOString(),
      horizonDays: differenceInDays(prediction.predictedAt, realized.observedAt),
      predictedValueKrw: prediction.predictedValueKrw,
      realizedValueKrw: realized.realizedValueKrw,
      errorPct: round(errorPct),
      absErrorPct: round(Math.abs(errorPct)),
      capRateResidualPct
    });
  }

  return {
    overall: computeMetrics(points),
    byAssetClass: groupBy(points, (p) => p.assetClass),
    byVintage: groupBy(points, (p) => String(p.vintageYear)),
    byAssetClassAndVintage: groupBy(points, (p) => `${p.assetClass}:${p.vintageYear}`),
    points
  };
}
