import type { Asset, PrismaClient, RealizedOutcome, ValuationRun } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import type { GradientBoostingForecast } from '@/lib/services/forecast/gradient-boosting';
import { assetBundleInclude } from '@/lib/services/assets';
import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';
import { realizedOutcomeSchema } from '@/lib/validations/realized-outcome';

type RunForComparison = Pick<
  ValuationRun,
  'id' | 'assetId' | 'createdAt' | 'baseCaseValueKrw' | 'assumptions'
> & {
  asset: Pick<Asset, 'id' | 'name' | 'assetCode' | 'assetClass'>;
  scenarios: Array<{
    name: string;
    debtServiceCoverage: number | null;
  }>;
};

type OutcomeForComparison = Pick<
  RealizedOutcome,
  | 'id'
  | 'assetId'
  | 'observationDate'
  | 'occupancyPct'
  | 'noiKrw'
  | 'rentGrowthPct'
  | 'valuationKrw'
  | 'debtServiceCoverage'
  | 'exitCapRatePct'
  | 'notes'
>;

type AssetOutcomeLike = {
  id: string;
  name: string;
  assetCode: string;
  assetClass: Asset['assetClass'];
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function differenceInDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getOccupancyAssumption(assumptions: unknown) {
  if (!assumptions || typeof assumptions !== 'object') return null;
  const record = assumptions as Record<string, unknown>;
  return toNumber(record.occupancyPct) ?? toNumber(record.stabilizedOccupancyPct);
}

export function normalizeRealizedOutcomeObservationDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function createRealizedOutcome(
  assetId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = realizedOutcomeSchema.parse(input);
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      address: {
        select: {
          country: true
        }
      },
      market: true
    }
  });

  if (!asset) throw new Error('Asset not found');

  const inputCurrency = resolveInputCurrency(
    asset.address?.country ?? asset.market,
    parsed.inputCurrency
  );
  const observationDate = normalizeRealizedOutcomeObservationDate(parsed.observationDate);

  await db.realizedOutcome.upsert({
    where: {
      assetId_observationDate: {
        assetId,
        observationDate
      }
    },
    update: {
      occupancyPct: parsed.occupancyPct,
      noiKrw: typeof parsed.noiKrw === 'number' ? convertToKrw(parsed.noiKrw, inputCurrency) : null,
      rentGrowthPct: parsed.rentGrowthPct,
      valuationKrw:
        typeof parsed.valuationKrw === 'number'
          ? convertToKrw(parsed.valuationKrw, inputCurrency)
          : null,
      debtServiceCoverage: parsed.debtServiceCoverage,
      exitCapRatePct: parsed.exitCapRatePct,
      notes: parsed.notes,
      sourceSystem: 'manual_realized_capture',
      sourceStatus: 'MANUAL'
    },
    create: {
      assetId,
      observationDate,
      occupancyPct: parsed.occupancyPct,
      noiKrw: typeof parsed.noiKrw === 'number' ? convertToKrw(parsed.noiKrw, inputCurrency) : null,
      rentGrowthPct: parsed.rentGrowthPct,
      valuationKrw:
        typeof parsed.valuationKrw === 'number'
          ? convertToKrw(parsed.valuationKrw, inputCurrency)
          : null,
      debtServiceCoverage: parsed.debtServiceCoverage,
      exitCapRatePct: parsed.exitCapRatePct,
      notes: parsed.notes,
      sourceSystem: 'manual_realized_capture',
      sourceStatus: 'MANUAL'
    }
  });

  return db.asset.findUnique({
    where: {
      id: assetId
    },
    include: assetBundleInclude
  });
}

export type RealizedOutcomeComparison = ReturnType<typeof buildRealizedOutcomeComparison>;
export type RealizedOutcomeSummary = ReturnType<typeof buildRealizedOutcomeSummary>;

export function selectMatchedOutcome(
  runCreatedAt: Date,
  outcomes: OutcomeForComparison[]
): OutcomeForComparison | null {
  const future = [...outcomes]
    .filter((outcome) => outcome.observationDate.getTime() >= runCreatedAt.getTime())
    .sort((left, right) => left.observationDate.getTime() - right.observationDate.getTime());

  return future[0] ?? null;
}

export function buildRealizedOutcomeComparison({
  run,
  outcomes,
  forecast
}: {
  run: RunForComparison;
  outcomes: OutcomeForComparison[];
  forecast?: GradientBoostingForecast | null;
}) {
  const matchedOutcome = selectMatchedOutcome(run.createdAt, outcomes);
  if (!matchedOutcome) {
    return {
      status: 'NO_MATCH' as const,
      match: null,
      commentary: 'No realized outcome exists after this valuation run yet.'
    };
  }

  const baseDscr = pickBaseDscr(run.scenarios) ?? null;
  const actualValueChangePct =
    matchedOutcome.valuationKrw && run.baseCaseValueKrw > 0
      ? round(((matchedOutcome.valuationKrw - run.baseCaseValueKrw) / run.baseCaseValueKrw) * 100)
      : null;
  const actualDscrChangePct =
    matchedOutcome.debtServiceCoverage !== null &&
    matchedOutcome.debtServiceCoverage !== undefined &&
    baseDscr !== null &&
    baseDscr > 0
      ? round(((matchedOutcome.debtServiceCoverage - baseDscr) / baseDscr) * 100)
      : null;
  const occupancyAssumptionPct = getOccupancyAssumption(run.assumptions);
  const occupancyGapPct =
    matchedOutcome.occupancyPct !== null &&
    matchedOutcome.occupancyPct !== undefined &&
    occupancyAssumptionPct !== null
      ? round(matchedOutcome.occupancyPct - occupancyAssumptionPct)
      : null;
  const valueForecastErrorPct =
    forecast?.predictedValueChangePct !== null &&
    forecast?.predictedValueChangePct !== undefined &&
    actualValueChangePct !== null
      ? round(actualValueChangePct - forecast.predictedValueChangePct)
      : null;
  const dscrForecastErrorPct =
    forecast?.predictedDscrChangePct !== null &&
    forecast?.predictedDscrChangePct !== undefined &&
    actualDscrChangePct !== null
      ? round(actualDscrChangePct - forecast.predictedDscrChangePct)
      : null;
  const horizonDays = differenceInDays(run.createdAt, matchedOutcome.observationDate);

  let commentary = `${horizonDays}-day realized check after the valuation run.`;
  if (valueForecastErrorPct !== null) {
    commentary +=
      Math.abs(valueForecastErrorPct) <= 5
        ? ' The ML drift call stayed close to the realized value move.'
        : valueForecastErrorPct > 0
          ? ' Realized value outperformed the forecast.'
          : ' Realized value underperformed the forecast.';
  } else if (actualValueChangePct !== null) {
    commentary += ' Realized value is available, but no forecast match exists yet.';
  }

  return {
    status: 'MATCHED' as const,
    match: {
      outcomeId: matchedOutcome.id,
      observationDate: matchedOutcome.observationDate.toISOString(),
      horizonDays,
      occupancyPct: matchedOutcome.occupancyPct,
      noiKrw: matchedOutcome.noiKrw,
      rentGrowthPct: matchedOutcome.rentGrowthPct,
      valuationKrw: matchedOutcome.valuationKrw,
      debtServiceCoverage: matchedOutcome.debtServiceCoverage,
      exitCapRatePct: matchedOutcome.exitCapRatePct,
      notes: matchedOutcome.notes,
      actualValueChangePct,
      actualDscrChangePct,
      occupancyGapPct,
      valueForecastErrorPct,
      dscrForecastErrorPct
    },
    commentary
  };
}

export function buildRealizedOutcomeSummary({
  runs,
  outcomes
}: {
  runs: Array<
    Pick<ValuationRun, 'id' | 'assetId' | 'createdAt' | 'baseCaseValueKrw'> & {
      asset: AssetOutcomeLike;
      scenarios: Array<{ name: string; debtServiceCoverage: number | null }>;
    }
  >;
  outcomes: OutcomeForComparison[];
}) {
  const latestRunByAsset = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const current = latestRunByAsset.get(run.assetId);
    if (!current || current.createdAt < run.createdAt) {
      latestRunByAsset.set(run.assetId, run);
    }
  }

  const outcomesByAsset = new Map<string, OutcomeForComparison[]>();
  for (const outcome of outcomes) {
    const group = outcomesByAsset.get(outcome.assetId) ?? [];
    group.push(outcome);
    outcomesByAsset.set(outcome.assetId, group);
  }

  const comparisons = [...latestRunByAsset.values()]
    .map((run) =>
      buildRealizedOutcomeComparison({
        run: {
          ...run,
          assumptions: null
        },
        outcomes: outcomesByAsset.get(run.assetId) ?? []
      })
    )
    .filter((comparison) => comparison.status === 'MATCHED' && comparison.match);

  const matched = comparisons
    .map((comparison) => comparison.match)
    .filter((match): match is NonNullable<(typeof comparisons)[number]['match']> => match !== null);
  const valueErrors = matched
    .map((match) => match.actualValueChangePct)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value));
  const dscrErrors = matched
    .map((match) => match.actualDscrChangePct)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value));

  const watchlist = [...latestRunByAsset.values()]
    .map((run) => {
      const comparison = buildRealizedOutcomeComparison({
        run: {
          ...run,
          assumptions: null
        },
        outcomes: outcomesByAsset.get(run.assetId) ?? []
      });

      const match = comparison.match;
      if (comparison.status !== 'MATCHED' || !match) return null;
      return {
        assetId: run.asset.id,
        assetName: run.asset.name,
        assetCode: run.asset.assetCode,
        runId: run.id,
        observationDate: match.observationDate,
        actualValueChangePct: match.actualValueChangePct,
        actualDscrChangePct: match.actualDscrChangePct,
        horizonDays: match.horizonDays
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (left, right) =>
        Math.abs(right.actualValueChangePct ?? 0) - Math.abs(left.actualValueChangePct ?? 0) ||
        Math.abs(right.actualDscrChangePct ?? 0) - Math.abs(left.actualDscrChangePct ?? 0)
    )
    .slice(0, 4);

  return {
    assetCoverage: outcomesByAsset.size,
    matchedRunCount: matched.length,
    meanAbsoluteValueChangePct:
      valueErrors.length > 0
        ? round(valueErrors.reduce((sum, value) => sum + value, 0) / valueErrors.length)
        : null,
    meanAbsoluteDscrChangePct:
      dscrErrors.length > 0
        ? round(dscrErrors.reduce((sum, value) => sum + value, 0) / dscrErrors.length)
        : null,
    watchlist
  };
}
