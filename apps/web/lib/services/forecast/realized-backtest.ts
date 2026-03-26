import { AssetClass, type Asset, type RealizedOutcome, type ValuationRun } from '@prisma/client';
import { buildGradientBoostingForecast } from '@/lib/services/forecast/gradient-boosting';
import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';

type RunLike = Pick<ValuationRun, 'id' | 'assetId' | 'createdAt' | 'baseCaseValueKrw' | 'confidenceScore' | 'assumptions'> & {
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

export type GradientBoostingRealizedBacktest = {
  summary: {
    matchedForecastCount: number;
    assetCoverage: number;
    directionalHitRatePct: number | null;
    meanAbsoluteValueErrorPct: number | null;
    meanAbsoluteDscrErrorPct: number | null;
  };
  rows: GradientBoostingRealizedBacktestRow[];
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function differenceInDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function selectMatchedForecastOutcome(runCreatedAt: Date, outcomes: OutcomeLike[]) {
  return [...outcomes]
    .filter((outcome) => outcome.observationDate.getTime() >= runCreatedAt.getTime())
    .sort((left, right) => left.observationDate.getTime() - right.observationDate.getTime())[0] ?? null;
}

function sign(value: number) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

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

  const orderedRuns = [...runs].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const rows: GradientBoostingRealizedBacktestRow[] = [];

  for (const run of orderedRuns) {
    const matchedOutcome = selectMatchedForecastOutcome(run.createdAt, outcomesByAsset.get(run.assetId) ?? []);
    if (!matchedOutcome || matchedOutcome.valuationKrw === null || matchedOutcome.valuationKrw === undefined) continue;

    const availableHistory = orderedRuns.filter((candidate) => candidate.createdAt.getTime() <= run.createdAt.getTime());
    const forecast = buildGradientBoostingForecast(run, availableHistory);
    if (forecast.status !== 'READY' || forecast.predictedValueChangePct === null) continue;

    const actualValueChangePct =
      run.baseCaseValueKrw > 0
        ? round(((matchedOutcome.valuationKrw - run.baseCaseValueKrw) / run.baseCaseValueKrw) * 100)
        : 0;
    const baseDscr = pickBaseDscr(run.scenarios);
    const actualDscrChangePct =
      matchedOutcome.debtServiceCoverage !== null &&
      matchedOutcome.debtServiceCoverage !== undefined &&
      baseDscr !== null &&
      baseDscr > 0
        ? round(((matchedOutcome.debtServiceCoverage - baseDscr) / baseDscr) * 100)
        : null;
    const predictedDscrChangePct = forecast.predictedDscrChangePct;

    rows.push({
      runId: run.id,
      assetId: run.asset.id,
      assetName: run.asset.name,
      assetCode: run.asset.assetCode,
      assetClass: run.asset.assetClass,
      runDate: run.createdAt.toISOString(),
      outcomeDate: matchedOutcome.observationDate.toISOString(),
      horizonDays: differenceInDays(run.createdAt, matchedOutcome.observationDate),
      predictedValueChangePct: forecast.predictedValueChangePct,
      actualValueChangePct,
      valueErrorPct: round(actualValueChangePct - forecast.predictedValueChangePct),
      predictedDscrChangePct,
      actualDscrChangePct,
      dscrErrorPct:
        predictedDscrChangePct !== null && actualDscrChangePct !== null
          ? round(actualDscrChangePct - predictedDscrChangePct)
          : null
    });
  }

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
        valueErrors.length > 0 ? round(valueErrors.reduce((sum, value) => sum + value, 0) / valueErrors.length) : null,
      meanAbsoluteDscrErrorPct:
        dscrErrors.length > 0 ? round(dscrErrors.reduce((sum, value) => sum + value, 0) / dscrErrors.length) : null
    },
    rows: rows.sort(
      (left, right) =>
        Math.abs(right.valueErrorPct) - Math.abs(left.valueErrorPct) ||
        Math.abs(right.dscrErrorPct ?? 0) - Math.abs(left.dscrErrorPct ?? 0)
    )
  };
}
