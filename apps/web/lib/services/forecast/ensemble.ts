import type { ForecastModelStack } from '@/lib/services/forecast/model-stack';
import type { GradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';
import type { MacroBacktest } from '@/lib/services/macro/backtest';
import type { MacroForecastBacktest } from '@/lib/services/macro/forecast-backtest';

type EnsembleKey = 'macro-regime-nowcast' | 'monte-carlo-envelope' | 'gradient-boosting-forecast';
type UseCaseKey = 'market-nowcast' | 'committee-downside' | 'asset-drift';

export type ForecastEnsembleWeight = {
  modelKey: EnsembleKey;
  label: string;
  weightPct: number;
  qualityScore: number;
  rationale: string;
};

export type ForecastEnsembleUseCase = {
  key: UseCaseKey;
  label: string;
  summary: string;
  championModelKey: EnsembleKey;
  challengerModelKey: EnsembleKey | null;
  weights: ForecastEnsembleWeight[];
};

export type ForecastEnsemblePolicy = {
  summary: {
    primaryModelKey: EnsembleKey;
    validatedModelCount: number;
    portfolioForecastConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  useCases: ForecastEnsembleUseCase[];
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function normalizeWeights(
  input: Array<{
    modelKey: EnsembleKey;
    label: string;
    baseWeight: number;
    qualityScore: number;
    rationale: string;
  }>
) {
  const weighted = input.map((item) => ({
    ...item,
    combined: item.baseWeight * Math.max(item.qualityScore, 5)
  }));
  const total = weighted.reduce((sum, item) => sum + item.combined, 0);

  return weighted
    .map((item) => ({
      modelKey: item.modelKey,
      label: item.label,
      weightPct: total > 0 ? round((item.combined / total) * 100) : 0,
      qualityScore: round(item.qualityScore),
      rationale: item.rationale
    }))
    .sort((left, right) => right.weightPct - left.weightPct);
}

function buildModelScoreMap({
  modelStack,
  macroBacktest,
  macroForecastBacktest,
  forecastRealizedBacktest
}: {
  modelStack: ForecastModelStack;
  macroBacktest: MacroBacktest;
  macroForecastBacktest: MacroForecastBacktest;
  forecastRealizedBacktest: GradientBoostingRealizedBacktest;
}) {
  const readinessByKey = new Map(modelStack.models.map((model) => [model.key, model.readinessScore]));
  const monteScore = readinessByKey.get('monte-carlo-envelope') ?? 50;
  const regimeReadiness = readinessByKey.get('regime-nowcast') ?? 50;
  const treeReadiness = readinessByKey.get('gradient-boosting-forecast') ?? 50;

  const regimeValidation = clamp(
    (macroBacktest.summary.overallHitRatePct * 0.55) +
      ((macroForecastBacktest.summary.directionalHitRatePct ?? 0) * 0.25) +
      Math.max(0, 20 - Math.min(macroForecastBacktest.summary.meanAbsoluteErrorPct ?? 20, 20))
  );
  const treeValidation =
    forecastRealizedBacktest.summary.matchedForecastCount > 0
      ? clamp(
          (forecastRealizedBacktest.summary.directionalHitRatePct ?? 0) * 0.6 +
            Math.max(
              0,
              25 - Math.min(forecastRealizedBacktest.summary.meanAbsoluteValueErrorPct ?? 25, 25)
            ) +
            Math.min(forecastRealizedBacktest.summary.matchedForecastCount * 2.5, 15)
        )
      : null;

  return {
    'macro-regime-nowcast': clamp(regimeReadiness * 0.55 + regimeValidation * 0.45),
    'monte-carlo-envelope': clamp(monteScore),
    'gradient-boosting-forecast': treeValidation === null ? clamp(treeReadiness * 0.85) : clamp(treeReadiness * 0.45 + treeValidation * 0.55),
    validatedModelCount: [regimeValidation, treeValidation].filter((value) => value !== null).length
  } as const;
}

export function buildForecastEnsemblePolicy({
  modelStack,
  macroBacktest,
  macroForecastBacktest,
  forecastRealizedBacktest
}: {
  modelStack: ForecastModelStack;
  macroBacktest: MacroBacktest;
  macroForecastBacktest: MacroForecastBacktest;
  forecastRealizedBacktest: GradientBoostingRealizedBacktest;
}): ForecastEnsemblePolicy {
  const scores = buildModelScoreMap({
    modelStack,
    macroBacktest,
    macroForecastBacktest,
    forecastRealizedBacktest
  });

  const configuredUseCases = [
    {
      key: 'market-nowcast',
      label: 'Market Nowcast',
      summary: 'Use for top-down market stance, allocation, and macro interpretation before asset-level downside work.',
      weights: normalizeWeights([
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 60,
          qualityScore: scores['macro-regime-nowcast'],
          rationale: 'Best suited to interpret macro regime direction and cross-market transmission.'
        },
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 20,
          qualityScore: scores['monte-carlo-envelope'],
          rationale: 'Adds distribution context, but it is not the primary directional signal.'
        },
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 20,
          qualityScore: scores['gradient-boosting-forecast'],
          rationale: 'Useful as a challenger model for short-horizon drift, not the first macro nowcast lens.'
        }
      ]),
      championModelKey: 'macro-regime-nowcast',
      challengerModelKey: 'gradient-boosting-forecast'
    },
    {
      key: 'committee-downside',
      label: 'Committee Downside',
      summary: 'Use for IC downside framing, breach probability, and scenario resilience.',
      weights: normalizeWeights([
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 55,
          qualityScore: scores['monte-carlo-envelope'],
          rationale: 'Best suited to downside distribution, tail cases, and breach probability framing.'
        },
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 30,
          qualityScore: scores['macro-regime-nowcast'],
          rationale: 'Provides the macro interpretation that should drive downside overlays and stress posture.'
        },
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 15,
          qualityScore: scores['gradient-boosting-forecast'],
          rationale: 'Useful as a check on near-term drift but not the primary committee downside engine.'
        }
      ]),
      championModelKey: 'monte-carlo-envelope',
      challengerModelKey: 'macro-regime-nowcast'
    },
    {
      key: 'asset-drift',
      label: 'Near-Term Asset Drift',
      summary: 'Use for 6-12 month value and DSCR drift on specific assets after underwriting is in place.',
      weights: normalizeWeights([
        {
          modelKey: 'gradient-boosting-forecast',
          label: 'Gradient Boosting Forecast',
          baseWeight: 50,
          qualityScore: scores['gradient-boosting-forecast'],
          rationale: 'This is the only learned model currently validated against realized asset outcomes.'
        },
        {
          modelKey: 'macro-regime-nowcast',
          label: 'Macro Regime Nowcast',
          baseWeight: 30,
          qualityScore: scores['macro-regime-nowcast'],
          rationale: 'Macro interpretation should still constrain near-term drift expectations.'
        },
        {
          modelKey: 'monte-carlo-envelope',
          label: 'Monte Carlo Envelope',
          baseWeight: 20,
          qualityScore: scores['monte-carlo-envelope'],
          rationale: 'Useful for error bands and downside framing around the learned point forecast.'
        }
      ]),
      championModelKey: 'gradient-boosting-forecast',
      challengerModelKey: 'macro-regime-nowcast'
    }
  ] satisfies ForecastEnsembleUseCase[];

  const useCases = configuredUseCases.map<ForecastEnsembleUseCase>((useCase) => ({
    ...useCase,
    championModelKey: useCase.weights[0]?.modelKey ?? useCase.championModelKey,
    challengerModelKey: useCase.weights[1]?.modelKey ?? useCase.challengerModelKey
  }));

  const primaryModelKey =
    [...useCases.flatMap((useCase) => useCase.weights)]
      .reduce<Record<EnsembleKey, number>>(
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

  const rankedPrimary = (Object.entries(primaryModelKey) as Array<[EnsembleKey, number]>).sort(
    (left, right) => right[1] - left[1]
  );
  const avgTopScore =
    useCases.reduce((sum, useCase) => sum + (useCase.weights[0]?.qualityScore ?? 0), 0) / Math.max(useCases.length, 1);

  return {
    summary: {
      primaryModelKey: rankedPrimary[0]?.[0] ?? 'macro-regime-nowcast',
      validatedModelCount: scores.validatedModelCount,
      portfolioForecastConfidence: avgTopScore >= 75 ? 'HIGH' : avgTopScore >= 55 ? 'MEDIUM' : 'LOW'
    },
    useCases
  };
}
