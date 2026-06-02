import { AssetClass, type Asset, type RealizedOutcome, type ValuationRun } from '@prisma/client';

import { clamp, round } from '@/lib/math';
import {
  buildFeatureVector,
  predictWithModel,
  trainBoostedStumps,
  type ForecastRunLike
} from '@/lib/services/forecast/gradient-boosting';
import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';

type RunLike = Pick<
  ValuationRun,
  'id' | 'assetId' | 'createdAt' | 'baseCaseValueKrw' | 'confidenceScore' | 'assumptions'
> & {
  asset: Pick<Asset, 'id' | 'name' | 'assetCode' | 'assetClass' | 'market'>;
  scenarios: Array<{
    name: string;
    debtServiceCoverage: number | null;
  }>;
};

type OutcomeLike = Pick<
  RealizedOutcome,
  'id' | 'assetId' | 'observationDate' | 'valuationKrw' | 'debtServiceCoverage'
>;

/**
 * Horizon definition.
 *
 * The labeled target is the realized value change over a FIXED ~12 month horizon.
 * We accept any realized outcome whose observation date falls inside a documented
 * band around 12 months and reject everything else, in BOTH training and
 * evaluation. The prior code claimed forecastHorizonMonths:12 but compared the
 * forecast to the realized outcome at *any* next observation date (no horizon
 * enforcement), so the reported error mixed 1-month and multi-year outcomes.
 */
export const HORIZON_MONTHS = 12;
export const HORIZON_WINDOW_MONTHS = 3; // accept 12 ± 3 months
const DAYS_PER_MONTH = 365.25 / 12;
export const HORIZON_TARGET_DAYS = Math.round(HORIZON_MONTHS * DAYS_PER_MONTH); // ~365
export const HORIZON_MIN_DAYS = Math.round(
  (HORIZON_MONTHS - HORIZON_WINDOW_MONTHS) * DAYS_PER_MONTH
); // ~274
export const HORIZON_MAX_DAYS = Math.round(
  (HORIZON_MONTHS + HORIZON_WINDOW_MONTHS) * DAYS_PER_MONTH
); // ~456

/** Minimum out-of-sample predictions required before we report a metric. */
export const MIN_OUT_OF_SAMPLE_POINTS = 3;

export type GradientBoostingRealizedBacktestRow = {
  runId: string;
  assetId: string;
  assetName: string;
  assetCode: string;
  assetClass: AssetClass;
  runDate: string;
  outcomeDate: string;
  horizonDays: number;
  predictedValueChangePct: number;
  actualValueChangePct: number;
  valueErrorPct: number;
  predictedDscrChangePct: number | null;
  actualDscrChangePct: number | null;
  dscrErrorPct: number | null;
};

export type OutOfSampleMetrics = {
  /** Number of leakage-free, horizon-aligned out-of-sample predictions evaluated. */
  evaluatedCount: number;
  status: 'OK' | 'INSUFFICIENT_HISTORY';
  rmsePct: number | null;
  maePct: number | null;
  /** Mean absolute percentage error of the value-change forecast vs realized. */
  mapePct: number | null;
  /** Naive random-walk-with-drift baseline MAE (percentage-point error on value change). */
  baselineMaePct: number | null;
  baselineRmsePct: number | null;
  /** Skill = 1 - model_error / baseline_error. >0 means the model beats naive. */
  skillVsNaive: number | null;
};

export type GradientBoostingRealizedBacktest = {
  summary: {
    matchedForecastCount: number;
    assetCoverage: number;
    directionalHitRatePct: number | null;
    meanAbsoluteValueErrorPct: number | null;
    meanAbsoluteDscrErrorPct: number | null;
    horizonMonths: number;
    horizonWindowMonths: number;
    /** Honest, leakage-free, horizon-aligned out-of-sample metrics. */
    outOfSample: OutOfSampleMetrics;
  };
  rows: GradientBoostingRealizedBacktestRow[];
};

function differenceInDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isWithinHorizon(days: number) {
  return days >= HORIZON_MIN_DAYS && days <= HORIZON_MAX_DAYS;
}

/**
 * Select the realized outcome that best aligns to a ~12 month horizon after the
 * run. Candidates outside the horizon band are rejected entirely; among the
 * in-band candidates we pick the one closest to the target horizon.
 */
function selectHorizonAlignedOutcome(runCreatedAt: Date, outcomes: OutcomeLike[]) {
  const candidates = outcomes
    .filter((outcome) => outcome.valuationKrw !== null && outcome.valuationKrw !== undefined)
    .map((outcome) => ({
      outcome,
      horizonDays: differenceInDays(runCreatedAt, outcome.observationDate)
    }))
    .filter((entry) => isWithinHorizon(entry.horizonDays))
    .sort(
      (left, right) =>
        Math.abs(left.horizonDays - HORIZON_TARGET_DAYS) -
        Math.abs(right.horizonDays - HORIZON_TARGET_DAYS)
    );

  return candidates[0] ?? null;
}

function sign(value: number) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rmse(errors: number[]) {
  if (errors.length === 0) return null;
  return Math.sqrt(mean(errors.map((error) => error * error)));
}

function mae(errors: number[]) {
  if (errors.length === 0) return null;
  return mean(errors.map((error) => Math.abs(error)));
}

function getBaseDscr(run: RunLike) {
  return pickBaseDscr(run.scenarios);
}

/**
 * The ONE labeled target used for both training and evaluation: the realized
 * value change (%) over the ~12 month horizon, relative to the run's base case.
 */
function realizedValueChangePct(run: RunLike, outcomeValuationKrw: number) {
  if (run.baseCaseValueKrw <= 0) return null;
  return ((outcomeValuationKrw - run.baseCaseValueKrw) / run.baseCaseValueKrw) * 100;
}

type LabeledRun = {
  run: RunLike;
  horizonDays: number;
  outcome: OutcomeLike;
  actualValueChangePct: number;
};

export function buildGradientBoostingRealizedBacktest({
  runs,
  outcomes
}: {
  runs: RunLike[];
  outcomes: OutcomeLike[];
}): GradientBoostingRealizedBacktest {
  const outcomesByAsset = new Map<string, OutcomeLike[]>();
  for (const outcome of outcomes) {
    const group = outcomesByAsset.get(outcome.assetId) ?? [];
    group.push(outcome);
    outcomesByAsset.set(outcome.assetId, group);
  }

  const orderedRuns = [...runs].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  );

  // Step 1: attach the ONE horizon-aligned realized label to each run. Runs with
  // no in-band realized outcome are dropped from supervised evaluation entirely.
  const labeled: LabeledRun[] = [];
  for (const run of orderedRuns) {
    const aligned = selectHorizonAlignedOutcome(
      run.createdAt,
      outcomesByAsset.get(run.assetId) ?? []
    );
    if (!aligned || aligned.outcome.valuationKrw === null) continue;
    const actualValueChangePct = realizedValueChangePct(run, aligned.outcome.valuationKrw);
    if (actualValueChangePct === null) continue;
    labeled.push({
      run,
      horizonDays: aligned.horizonDays,
      outcome: aligned.outcome,
      actualValueChangePct
    });
  }

  // Step 2: walk-forward (expanding-window) out-of-sample evaluation. For each
  // labeled run R (in time order) we train ONLY on labeled runs whose run date
  // AND realized observation date both strictly predate R, then predict R.
  const rows: GradientBoostingRealizedBacktestRow[] = [];
  const oosValueErrors: number[] = [];
  const oosBaselineErrors: number[] = [];
  const oosActuals: number[] = [];

  for (let index = 0; index < labeled.length; index += 1) {
    const point = labeled[index]!;
    const cutoff = point.run.createdAt.getTime();

    // Strict point-in-time training set: both endpoints (run date and the
    // horizon-aligned realized observation it is labeled with) must be known
    // strictly before R's run date. Exclude R itself.
    const trainingLabeled = labeled.filter(
      (candidate) =>
        candidate.run.id !== point.run.id &&
        candidate.run.createdAt.getTime() < cutoff &&
        candidate.outcome.observationDate.getTime() < cutoff
    );

    if (trainingLabeled.length < 3) continue;

    const trainFeatures = trainingLabeled.map((candidate) =>
      buildFeatureVector(toForecastRun(candidate.run))
    );
    const trainTargets = trainingLabeled.map((candidate) => candidate.actualValueChangePct);

    const model = trainBoostedStumps(trainFeatures, trainTargets);
    const predictedValueChangePct = round(
      clamp(predictWithModel(model, buildFeatureVector(toForecastRun(point.run))), -25, 25)
    );

    // Naive baseline: random-walk-with-drift. Best guess of the next horizon's
    // value change is the average realized horizon change observed so far.
    const baselinePrediction = round(mean(trainTargets));

    const actual = round(point.actualValueChangePct);
    oosValueErrors.push(actual - predictedValueChangePct);
    oosBaselineErrors.push(actual - baselinePrediction);
    oosActuals.push(actual);

    const baseDscr = getBaseDscr(point.run);
    const actualDscrChangePct =
      point.outcome.debtServiceCoverage !== null &&
      point.outcome.debtServiceCoverage !== undefined &&
      baseDscr !== null &&
      baseDscr > 0
        ? round(((point.outcome.debtServiceCoverage - baseDscr) / baseDscr) * 100)
        : null;

    rows.push({
      runId: point.run.id,
      assetId: point.run.asset.id,
      assetName: point.run.asset.name,
      assetCode: point.run.asset.assetCode,
      assetClass: point.run.asset.assetClass,
      runDate: point.run.createdAt.toISOString(),
      outcomeDate: point.outcome.observationDate.toISOString(),
      horizonDays: point.horizonDays,
      predictedValueChangePct,
      actualValueChangePct: actual,
      valueErrorPct: round(actual - predictedValueChangePct),
      predictedDscrChangePct: null,
      actualDscrChangePct,
      dscrErrorPct: null
    });
  }

  const outOfSample = computeOutOfSampleMetrics(oosValueErrors, oosBaselineErrors, oosActuals);

  const valueErrors = rows.map((row) => Math.abs(row.valueErrorPct));
  const dscrErrors = rows
    .map((row) => row.dscrErrorPct)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value));
  const directionalHits = rows.filter(
    (row) => sign(row.predictedValueChangePct) === sign(row.actualValueChangePct)
  ).length;

  return {
    summary: {
      matchedForecastCount: rows.length,
      assetCoverage: new Set(rows.map((row) => row.assetId)).size,
      directionalHitRatePct: rows.length > 0 ? round((directionalHits / rows.length) * 100) : null,
      meanAbsoluteValueErrorPct:
        valueErrors.length > 0
          ? round(valueErrors.reduce((sum, value) => sum + value, 0) / valueErrors.length)
          : null,
      meanAbsoluteDscrErrorPct:
        dscrErrors.length > 0
          ? round(dscrErrors.reduce((sum, value) => sum + value, 0) / dscrErrors.length)
          : null,
      horizonMonths: HORIZON_MONTHS,
      horizonWindowMonths: HORIZON_WINDOW_MONTHS,
      outOfSample
    },
    rows: rows.sort(
      (left, right) =>
        Math.abs(right.valueErrorPct) - Math.abs(left.valueErrorPct) ||
        Math.abs(right.dscrErrorPct ?? 0) - Math.abs(left.dscrErrorPct ?? 0)
    )
  };
}

function toForecastRun(run: RunLike): ForecastRunLike {
  return {
    id: run.id,
    assetId: run.assetId,
    createdAt: run.createdAt,
    baseCaseValueKrw: run.baseCaseValueKrw,
    confidenceScore: run.confidenceScore,
    assumptions: run.assumptions,
    asset: {
      id: run.asset.id,
      market: run.asset.market,
      assetClass: run.asset.assetClass,
      name: run.asset.name
    },
    scenarios: run.scenarios
  };
}

export function computeOutOfSampleMetrics(
  modelErrors: number[],
  baselineErrors: number[],
  actuals: number[]
): OutOfSampleMetrics {
  const evaluatedCount = modelErrors.length;
  if (evaluatedCount < MIN_OUT_OF_SAMPLE_POINTS) {
    return {
      evaluatedCount,
      status: 'INSUFFICIENT_HISTORY',
      rmsePct: null,
      maePct: null,
      mapePct: null,
      baselineMaePct: null,
      baselineRmsePct: null,
      skillVsNaive: null
    };
  }

  const modelRmse = rmse(modelErrors);
  const modelMae = mae(modelErrors);
  const baselineRmse = rmse(baselineErrors);
  const baselineMae = mae(baselineErrors);

  // MAPE: |error| / |actual|, guarding against near-zero actuals.
  const mapeTerms = modelErrors
    .map((error, index) => {
      const actual = actuals[index] ?? 0;
      if (Math.abs(actual) < 1e-9) return null;
      return Math.abs(error / actual);
    })
    .filter((value): value is number => value !== null);
  const mapePct = mapeTerms.length > 0 ? round(mean(mapeTerms) * 100) : null;

  // Skill = 1 - model_error / baseline_error (RMSE-based). >0 beats naive.
  const skillVsNaive =
    modelRmse !== null && baselineRmse !== null && baselineRmse > 1e-9
      ? round(1 - modelRmse / baselineRmse, 3)
      : null;

  return {
    evaluatedCount,
    status: 'OK',
    rmsePct: modelRmse === null ? null : round(modelRmse, 2),
    maePct: modelMae === null ? null : round(modelMae, 2),
    mapePct,
    baselineMaePct: baselineMae === null ? null : round(baselineMae, 2),
    baselineRmsePct: baselineRmse === null ? null : round(baselineRmse, 2),
    skillVsNaive
  };
}
