import { AssetClass, Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { GradientBoostingForecast } from '@/lib/services/forecast/gradient-boosting';
import { buildGradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
import { buildMacroBacktest } from '@/lib/services/macro/backtest';
import { buildMacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';

type DecisionModelKey = 'macro-regime-nowcast' | 'monte-carlo-envelope' | 'gradient-boosting-forecast';
type DecisionUseCaseKey = 'market-nowcast' | 'committee-downside' | 'asset-drift';

type ScenarioLike = {
  name: string;
  debtServiceCoverage: number | null;
};

type ForecastRunLike = {
  id: string;
  assetId: string;
  createdAt: Date;
  baseCaseValueKrw: number;
  confidenceScore: number;
  assumptions: Prisma.JsonValue;
  asset: {
    id: string;
    name: string;
    assetCode?: string;
    market: string;
    assetClass: AssetClass;
  };
  scenarios: ScenarioLike[];
};

type SensitivityRunLike = {
  runType: string;
};

export type ForecastDecisionWeight = {
  modelKey: DecisionModelKey;
  label: string;
  weightPct: number;
  confidenceScore: number;
  rationale: string;
};

export type ForecastDecisionUseCase = {
  key: DecisionUseCaseKey;
  label: string;
  summary: string;
  recommendedModelKey: DecisionModelKey;
  challengerModelKey: DecisionModelKey | null;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  weights: ForecastDecisionWeight[];
};

export type ForecastDecisionGuide = {
  summary: {
    market: string;
    assetClass: AssetClass;
    primaryModelKey: DecisionModelKey;
    overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
    note: string;
  };
  useCases: ForecastDecisionUseCase[];
};

export type ForecastDecisionNarrative = {
  leadSentence: string;
  constraintSentence: string;
  downsideSentence: string;
  leadLabel: string;
  leadModelKey: DecisionModelKey;
  challengerModelKey: DecisionModelKey | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function toneFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 75) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  return 'LOW';
}

export function buildForecastDecisionNarrative(guide: ForecastDecisionGuide | null): ForecastDecisionNarrative | null {
  const assetDrift = guide?.useCases.find((useCase) => useCase.key === 'asset-drift');
  const marketNowcast = guide?.useCases.find((useCase) => useCase.key === 'market-nowcast');
  const committeeDownside = guide?.useCases.find((useCase) => useCase.key === 'committee-downside');

  if (!assetDrift || !marketNowcast || !committeeDownside) return null;

  const leadSentence =
    assetDrift.recommendedModelKey === 'gradient-boosting-forecast'
      ? 'Use the learned ML drift forecast as the lead point estimate for the next 12 months.'
      : assetDrift.recommendedModelKey === 'macro-regime-nowcast'
        ? 'Use macro regime interpretation as the lead lens and treat ML drift as a challenger only.'
        : 'Use the Monte Carlo envelope first and treat point forecasts as secondary.';

  const constraintSentence =
    marketNowcast.recommendedModelKey === 'macro-regime-nowcast'
      ? 'Keep macro regime as the top-down constraint before trusting any short-horizon value drift.'
      : 'Top-down macro interpretation is currently less dominant, so the point forecast can carry more weight.';

  const downsideSentence =
    committeeDownside.recommendedModelKey === 'monte-carlo-envelope'
      ? 'For committee downside framing, rely on Monte Carlo for range and breach language rather than the point forecast alone.'
      : 'Current downside framing does not depend primarily on Monte Carlo, so the point forecast can carry more narrative weight.';

  return {
    leadSentence,
    constraintSentence,
    downsideSentence,
    leadLabel: assetDrift.label,
    leadModelKey: assetDrift.recommendedModelKey,
    challengerModelKey: assetDrift.challengerModelKey
  };
}

function normalizeWeights(
  input: Array<{
    modelKey: DecisionModelKey;
    label: string;
    baseWeight: number;
    confidenceScore: number;
    rationale: string;
  }>
) {
  const weighted = input.map((item) => ({
    ...item,
    combined: item.baseWeight * Math.max(item.confidenceScore, 5)
  }));
  const total = weighted.reduce((sum, item) => sum + item.combined, 0);

  return weighted
    .map<ForecastDecisionWeight>((item) => ({
      modelKey: item.modelKey,
      label: item.label,
      weightPct: total > 0 ? round((item.combined / total) * 100) : 0,
      confidenceScore: round(item.confidenceScore),
      rationale: item.rationale
    }))
    .sort((left, right) => right.weightPct - left.weightPct);
}

function buildMacroModelScore(params: {
  macroHitRatePct: number;
  macroForecastHitRatePct: number;
  macroForecastMaePct: number;
  hasMacroRegime: boolean;
}) {
  const score =
    params.macroHitRatePct * 0.5 +
    params.macroForecastHitRatePct * 0.25 +
    Math.max(0, 25 - Math.min(params.macroForecastMaePct, 25));

  return clamp(params.hasMacroRegime ? score : score * 0.55);
}

function buildMonteCarloScore(params: {
  hasMonteCarlo: boolean;
  confidenceScore: number;
}) {
  if (!params.hasMonteCarlo) return 25;
  return clamp(58 + params.confidenceScore * 0.25);
}

function buildGradientScore(params: {
  boostedForecast: GradientBoostingForecast | null;
  directionalHitRatePct: number;
  meanAbsoluteValueErrorPct: number;
  matchedForecastCount: number;
}) {
  const validationScore =
    params.matchedForecastCount > 0
      ? params.directionalHitRatePct * 0.55 +
        Math.max(0, 30 - Math.min(params.meanAbsoluteValueErrorPct, 30)) +
        Math.min(params.matchedForecastCount * 2.5, 15)
      : 35;

  const readinessScore =
    params.boostedForecast?.status === 'READY'
      ? 72 + Math.min(params.boostedForecast.sampleCount * 0.4, 12)
      : 28;
  const readyBoost = params.boostedForecast?.status === 'READY' ? 8 : 0;

  return clamp(readinessScore * 0.45 + validationScore * 0.55 + readyBoost);
}

export function buildForecastDecisionGuide(input: {
  currentRun: ForecastRunLike;
  historyRuns: ForecastRunLike[];
  marketFactors: Array<{
    market: string;
    observationDate: Date;
    factorKey: string;
    label: string;
    value: number;
    direction: string;
  }>;
  realizedOutcomes: Array<{
    assetId: string;
    observationDate: Date;
    valuationKrw: number | null;
    debtServiceCoverage: number | null;
  }>;
  sensitivityRuns: SensitivityRunLike[];
  boostedForecast: GradientBoostingForecast | null;
}): ForecastDecisionGuide {
  const macroBacktest = buildMacroBacktest(input.marketFactors as any);
  const macroForecastBacktest = buildMacroForecastBacktest(input.marketFactors as any);
  const realizedBacktest = buildGradientBoostingRealizedBacktest({
    runs: input.historyRuns.map((run) => ({
      ...run,
      asset: {
        ...run.asset,
        assetCode: run.asset.assetCode ?? run.asset.id
      }
    })),
    outcomes: input.realizedOutcomes as any
  });
  const hasMacroRegime =
    typeof input.currentRun.assumptions === 'object' &&
    input.currentRun.assumptions !== null &&
    'macroRegime' in input.currentRun.assumptions;
  const hasMonteCarlo = input.sensitivityRuns.some((run) => run.runType === 'MONTE_CARLO');

  const macroScore = buildMacroModelScore({
    macroHitRatePct: macroBacktest.summary.overallHitRatePct,
    macroForecastHitRatePct: macroForecastBacktest.summary.directionalHitRatePct,
    macroForecastMaePct: macroForecastBacktest.summary.meanAbsoluteErrorPct,
    hasMacroRegime
  });
  const monteScore = buildMonteCarloScore({
    hasMonteCarlo,
    confidenceScore: input.currentRun.confidenceScore
  });
  const gradientScore = buildGradientScore({
    boostedForecast: input.boostedForecast,
    directionalHitRatePct: realizedBacktest.summary.directionalHitRatePct ?? 0,
    meanAbsoluteValueErrorPct: realizedBacktest.summary.meanAbsoluteValueErrorPct ?? 25,
    matchedForecastCount: realizedBacktest.summary.matchedForecastCount
  });

  const baseUseCases = [
    {
      key: 'market-nowcast',
      label: 'Market Nowcast',
      summary: 'Use this when deciding how much macro posture should drive the current deal view.',
      weights: normalizeWeights([
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 60,
          confidenceScore: macroScore,
          rationale: hasMacroRegime
            ? 'This run already carries market-specific macro interpretation and transmission paths.'
            : 'Macro regime coverage is partial for this run, so conviction is reduced.'
        },
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 20,
          confidenceScore: monteScore,
          rationale: hasMonteCarlo
            ? 'Useful as a supporting risk distribution around the market view.'
            : 'Downside distribution is not persisted for this run, so this remains secondary.'
        },
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 20,
          confidenceScore: gradientScore,
          rationale:
            input.boostedForecast?.status === 'READY'
              ? 'Helpful challenger for short-horizon drift, but not the first top-down market lens.'
              : 'ML drift forecast is not ready enough to lead market interpretation for this deal.'
        }
      ]),
      recommendedModelKey: 'macro-regime-nowcast',
      challengerModelKey: 'gradient-boosting-forecast',
      confidenceBand: 'MEDIUM'
    },
    {
      key: 'committee-downside',
      label: 'Committee Downside',
      summary: 'Use this when framing breach risk, downside cases, and committee language.',
      weights: normalizeWeights([
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 55,
          confidenceScore: monteScore,
          rationale: hasMonteCarlo
            ? 'Best engine for tail cases, downside bands, and breach probability framing.'
            : 'Monte Carlo coverage is thin for this run, so downside framing leans more on macro regime.'
        },
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 30,
          confidenceScore: macroScore,
          rationale: 'Macro interpretation should still anchor downside posture and stress assumptions.'
        },
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 15,
          confidenceScore: gradientScore,
          rationale: 'Useful as a challenger on short-term drift, but not the core IC downside engine.'
        }
      ]),
      recommendedModelKey: 'monte-carlo-envelope',
      challengerModelKey: 'macro-regime-nowcast',
      confidenceBand: 'MEDIUM'
    },
    {
      key: 'asset-drift',
      label: 'Near-Term Asset Drift',
      summary: 'Use this when asking where value and DSCR are likely to move over the next 6-12 months.',
      weights: normalizeWeights([
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 50,
          confidenceScore: gradientScore,
          rationale:
            input.boostedForecast?.status === 'READY'
              ? 'This run has enough sequential history to support a learned short-horizon drift forecast.'
              : 'This run does not yet have enough sequential history for ML to be the lead drift signal.'
        },
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 30,
          confidenceScore: macroScore,
          rationale: 'Macro regime remains the fallback constraint when learned drift signal is weak.'
        },
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 20,
          confidenceScore: monteScore,
          rationale: 'Useful for uncertainty bands around the point forecast.'
        }
      ]),
      recommendedModelKey: 'gradient-boosting-forecast',
      challengerModelKey: 'macro-regime-nowcast',
      confidenceBand: 'MEDIUM'
    }
  ] satisfies ForecastDecisionUseCase[];

  const useCases = baseUseCases.map<ForecastDecisionUseCase>((useCase) => {
    const recommended =
      useCase.key === 'asset-drift' && input.boostedForecast?.status === 'READY'
        ? 'gradient-boosting-forecast'
        : (useCase.weights[0]?.modelKey ?? useCase.recommendedModelKey);
    const topScore = useCase.weights[0]?.confidenceScore ?? 0;
    return {
      ...useCase,
      recommendedModelKey: recommended,
      challengerModelKey: useCase.weights[1]?.modelKey ?? useCase.challengerModelKey,
      confidenceBand: toneFromScore(topScore)
    };
  });

  const primaryModelKey =
    [...useCases.flatMap((useCase) => useCase.weights)].reduce<Record<DecisionModelKey, number>>(
      (acc, weight) => {
        acc[weight.modelKey] = (acc[weight.modelKey] ?? 0) + weight.weightPct;
        return acc;
      },
      {
        'macro-regime-nowcast': 0,
        'monte-carlo-envelope': 0,
        'gradient-boosting-forecast': 0
      }
    );

  const rankedPrimary = (Object.entries(primaryModelKey) as Array<[DecisionModelKey, number]>).sort(
    (left, right) => right[1] - left[1]
  );
  const avgConfidence =
    useCases.reduce((sum, useCase) => sum + (useCase.weights[0]?.confidenceScore ?? 0), 0) /
    Math.max(useCases.length, 1);

  return {
    summary: {
      market: input.currentRun.asset.market,
      assetClass: input.currentRun.asset.assetClass,
      primaryModelKey: rankedPrimary[0]?.[0] ?? 'macro-regime-nowcast',
      overallConfidence: toneFromScore(avgConfidence),
      note:
        input.boostedForecast?.status === 'READY'
          ? 'This deal can use learned drift forecast as a challenger, while macro regime still anchors interpretation.'
          : 'This deal still leans more on macro regime and Monte Carlo because the learned drift signal is thin.'
    },
    useCases
  };
}

export async function getForecastDecisionGuideForRun(
  runId: string,
  boostedForecast: GradientBoostingForecast | null,
  db: PrismaClient = prisma
) {
  const [currentRun, historyRuns, realizedOutcomes] = await Promise.all([
    db.valuationRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        baseCaseValueKrw: true,
        confidenceScore: true,
        assumptions: true,
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true,
            market: true,
            assetClass: true
          }
        },
        scenarios: {
          select: {
            name: true,
            debtServiceCoverage: true
          },
          orderBy: {
            scenarioOrder: 'asc'
          }
        },
        sensitivityRuns: {
          select: {
            runType: true
          }
        }
      }
    }),
    db.valuationRun.findMany({
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        baseCaseValueKrw: true,
        confidenceScore: true,
        assumptions: true,
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true,
            market: true,
            assetClass: true
          }
        },
        scenarios: {
          select: {
            name: true,
            debtServiceCoverage: true
          },
          orderBy: {
            scenarioOrder: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 240
    }),
    db.realizedOutcome.findMany({
      select: {
        assetId: true,
        observationDate: true,
        valuationKrw: true,
        debtServiceCoverage: true
      },
      orderBy: {
        observationDate: 'desc'
      }
    })
  ]);

  if (!currentRun) return null;

  const marketFactors = await db.macroFactor.findMany({
    where: {
      market: currentRun.asset.market
    },
    orderBy: {
      observationDate: 'desc'
    },
    take: 240
  });

  return buildForecastDecisionGuide({
    currentRun,
    historyRuns,
    marketFactors,
    realizedOutcomes,
    sensitivityRuns: currentRun.sensitivityRuns,
    boostedForecast
  });
}
