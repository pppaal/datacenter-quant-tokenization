import { AssetClass } from '@prisma/client';
import type { GradientBoostingRealizedBacktest } from '@/lib/services/forecast/realized-backtest';

type AssetLike = {
  market: string;
  assetClass: AssetClass;
  transactionComps?: Array<unknown>;
  rentComps?: Array<unknown>;
  marketIndicatorSeries?: Array<unknown>;
  valuations?: Array<unknown>;
  documents?: Array<unknown>;
  counterparties?: Array<{
    financialStatements?: Array<unknown>;
  }>;
};

export type ForecastModelStatus = 'LIVE' | 'READY' | 'BUILDING' | 'DATA_GAP';

export type ForecastModelCard = {
  key: string;
  label: string;
  family: 'simulation' | 'rules' | 'tree' | 'sequence' | 'deep' | 'graph';
  cadence: 'intraday' | 'daily' | 'weekly' | 'release-based';
  status: ForecastModelStatus;
  readinessScore: number;
  validationScore: number | null;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVALIDATED';
  ranking: number;
  currentUse: string;
  requiredData: string[];
  unlockCriteria: string[];
  rankingNote: string;
};

export type ForecastModelStack = {
  summary: {
    liveModels: number;
    buildableModels: number;
    blockedModels: number;
    dailyCapableModels: number;
  };
  features: {
    assetCount: number;
    marketCount: number;
    assetClassCoverage: number;
    marketEvidenceAssets: number;
    valuationHistoryCount: number;
    macroObservationCount: number;
    documentCount: number;
    financialStatementCount: number;
  };
  models: ForecastModelCard[];
};

function uniqueCount<T>(items: T[]) {
  return new Set(items).size;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveStatus(score: number): ForecastModelStatus {
  if (score >= 85) return 'LIVE';
  if (score >= 70) return 'READY';
  if (score >= 45) return 'BUILDING';
  return 'DATA_GAP';
}

function resolveConfidenceBand(validationScore: number | null): ForecastModelCard['confidenceBand'] {
  if (validationScore === null) return 'UNVALIDATED';
  if (validationScore >= 75) return 'HIGH';
  if (validationScore >= 55) return 'MEDIUM';
  return 'LOW';
}

function buildRankingNote(model: Pick<ForecastModelCard, 'label' | 'confidenceBand' | 'validationScore' | 'readinessScore'>) {
  if (model.validationScore === null) {
    return `${model.label} is ranked on data readiness only because realized backtest coverage is still thin.`;
  }

  if (model.confidenceBand === 'HIGH') {
    return `${model.label} is earning high confidence from realized validation and data coverage.`;
  }

  if (model.confidenceBand === 'MEDIUM') {
    return `${model.label} is usable, but realized validation still shows moderate forecast error.`;
  }

  return `${model.label} needs recalibration before it should influence committee-facing conviction.`;
}

export function buildForecastModelStack(input: {
  assets: AssetLike[];
  documents: Array<unknown>;
  macroObservationCount: number;
  realizedBacktest?: GradientBoostingRealizedBacktest | null;
}) : ForecastModelStack {
  const assetCount = input.assets.length;
  const marketCount = uniqueCount(input.assets.map((asset) => asset.market));
  const assetClassCoverage = uniqueCount(input.assets.map((asset) => asset.assetClass));
  const marketEvidenceAssets = input.assets.filter(
    (asset) =>
      (asset.transactionComps?.length ?? 0) > 0 ||
      (asset.rentComps?.length ?? 0) > 0 ||
      (asset.marketIndicatorSeries?.length ?? 0) > 0
  ).length;
  const valuationHistoryCount = input.assets.reduce((sum, asset) => sum + (asset.valuations?.length ?? 0), 0);
  const documentCount = input.documents.length;
  const financialStatementCount = input.assets.reduce(
    (sum, asset) =>
      sum +
      (asset.counterparties?.reduce(
        (counterpartySum, counterparty) => counterpartySum + (counterparty.financialStatements?.length ?? 0),
        0
      ) ?? 0),
    0
  );
  const macroObservationCount = input.macroObservationCount;

  const models = [
    {
      key: 'monte-carlo-envelope',
      label: 'Monte Carlo Envelope',
      family: 'simulation',
      cadence: 'daily',
      readinessScore: clampScore(
        55 +
          Math.min(20, valuationHistoryCount * 2) +
          Math.min(15, macroObservationCount / 12)
      ),
      currentUse: 'Stress-distribution engine for value and DSCR under macro shocks.',
      requiredData: ['valuation paths', 'macro regime guidance', 'base-case assumptions'],
      unlockCriteria: ['already usable', 'add correlated shocks for v2'],
      validationScore: null
    },
    {
      key: 'regime-nowcast',
      label: 'Macro Regime Nowcast',
      family: 'rules',
      cadence: 'daily',
      readinessScore: clampScore(
        60 +
          Math.min(20, marketCount * 6) +
          Math.min(15, macroObservationCount / 20)
      ),
      currentUse: 'Current macro interpretation and underwriting guidance overlay.',
      requiredData: ['macro series', 'market indicators', 'country/submarket profile rules'],
      unlockCriteria: ['already usable', 'add more live macro connectors'],
      validationScore: null
    },
    {
      key: 'gradient-boosting-forecast',
      label: 'Gradient Boosting Forecast',
      family: 'tree',
      cadence: 'daily',
      readinessScore: clampScore(
        assetCount * 2 +
          marketEvidenceAssets * 4 +
          Math.min(25, valuationHistoryCount * 1.2) +
          Math.min(15, documentCount / 2)
      ),
      validationScore:
        input.realizedBacktest?.summary.matchedForecastCount
          ? clampScore(
              (input.realizedBacktest.summary.directionalHitRatePct ?? 0) * 0.55 +
                Math.max(
                  0,
                  35 - Math.min(input.realizedBacktest.summary.meanAbsoluteValueErrorPct ?? 35, 35)
                ) +
                Math.min(input.realizedBacktest.summary.matchedForecastCount * 3, 20)
            )
          : null,
      currentUse: 'Short-horizon value / rent / occupancy prediction from structured underwriting features.',
      requiredData: ['50+ valuation runs', 'market evidence coverage', 'clean factor history'],
      unlockCriteria: ['more labeled outcomes', 'backtest actual realized values']
    },
    {
      key: 'temporal-sequence-model',
      label: 'Temporal Sequence Model',
      family: 'sequence',
      cadence: 'daily',
      readinessScore: clampScore(
        macroObservationCount / 4 +
          valuationHistoryCount * 0.8 +
          marketCount * 5
      ),
      currentUse: 'Multi-period forecast path for rates, rents, occupancy, and value.',
      requiredData: ['200+ macro observations', '60+ valuation histories', 'market time-series continuity'],
      unlockCriteria: ['denser macro history', 'stable realized target series'],
      validationScore: null
    },
    {
      key: 'deep-tft-model',
      label: 'Deep Temporal Model',
      family: 'deep',
      cadence: 'daily',
      readinessScore: clampScore(
        macroObservationCount / 6 +
          valuationHistoryCount * 0.6 +
          financialStatementCount * 1.2
      ),
      currentUse: 'TFT/LSTM-style long-horizon probabilistic forecasting across macro and micro features.',
      requiredData: ['500+ aligned sequences', 'financial statement histories', 'outcome backtest set'],
      unlockCriteria: ['more sequences', 'consistent tenant/operator histories'],
      validationScore: null
    },
    {
      key: 'graph-market-diffusion',
      label: 'Graph Market Diffusion',
      family: 'graph',
      cadence: 'weekly',
      readinessScore: clampScore(
        marketCount * 8 +
          assetClassCoverage * 10 +
          marketEvidenceAssets * 2
      ),
      currentUse: 'Cross-market spillover and relative value propagation across cities and sectors.',
      requiredData: ['5+ active markets', '4+ asset classes', 'dense comp network'],
      unlockCriteria: ['more global markets', 'market link graph and realized spread data'],
      validationScore: null
    }
  ] satisfies Array<Omit<ForecastModelCard, 'status' | 'confidenceBand' | 'ranking' | 'rankingNote'>>;

  const scoredModels = models.map((model) => {
    const validationBoost = model.validationScore === null ? 0 : (model.validationScore - 50) * 0.35;
    const compositeScore = clampScore(model.readinessScore + validationBoost);
    return {
      ...model,
      readinessScore: compositeScore,
      status: resolveStatus(compositeScore),
      confidenceBand: resolveConfidenceBand(model.validationScore)
    };
  });

  const rankedModels = [...scoredModels].sort(
    (left, right) =>
      right.readinessScore - left.readinessScore ||
      (right.validationScore ?? -1) - (left.validationScore ?? -1)
  );

  const resolvedModels: ForecastModelCard[] = rankedModels.map((model, index) => ({
    ...model,
    ranking: index + 1,
    rankingNote: buildRankingNote(model)
  }));

  return {
    summary: {
      liveModels: resolvedModels.filter((model) => model.status === 'LIVE').length,
      buildableModels: resolvedModels.filter((model) => model.status === 'READY' || model.status === 'BUILDING').length,
      blockedModels: resolvedModels.filter((model) => model.status === 'DATA_GAP').length,
      dailyCapableModels: resolvedModels.filter((model) => model.cadence === 'daily' || model.cadence === 'intraday').length
    },
    features: {
      assetCount,
      marketCount,
      assetClassCoverage,
      marketEvidenceAssets,
      valuationHistoryCount,
      macroObservationCount,
      documentCount,
      financialStatementCount
    },
    models: resolvedModels
  };
}
