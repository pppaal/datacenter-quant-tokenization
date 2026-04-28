import type { MacroSeries, MarketSnapshot, SourceStatus } from '@prisma/client';
import { buildMacroSnapshot, type MacroRegimeSnapshot } from '@/lib/services/macro/series';
import { buildFactorTrendMap, type FactorTrendMetadata } from '@/lib/services/macro/trend';
import {
  getMarketFactorThresholds,
  getMarketInvertedThresholds
} from '@/lib/services/macro/market-thresholds';

export type MacroFactorKey =
  | 'inflation_trend'
  | 'rate_level'
  | 'rate_momentum_bps'
  | 'credit_stress'
  | 'liquidity'
  | 'growth_momentum'
  | 'construction_pressure'
  | 'property_demand';

export type MacroFactorDirection = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type MacroSensitivityProfile = {
  assetClass: string;
  label: string;
  market: string;
  country: string | null;
  submarket: string | null;
  adjustmentSummary: string[];
  capitalRateSensitivity: number;
  liquiditySensitivity: number;
  leasingSensitivity: number;
  constructionSensitivity: number;
};

export type MacroFactorPoint = {
  key: MacroFactorKey;
  label: string;
  value: number | null;
  unit: string;
  isObserved: boolean;
  direction: MacroFactorDirection;
  commentary: string;
  inputs: string[];
  trend?: FactorTrendMetadata;
};

export type MacroFactorSnapshot = {
  market: string;
  asOf: string | null;
  factors: MacroFactorPoint[];
};

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function buildSnapshot(input: {
  market: string;
  marketSnapshot?: MarketSnapshot | null;
  series?: MacroSeries[];
}) {
  return buildMacroSnapshot(input);
}

function getSeriesPoint(snapshot: MacroRegimeSnapshot, seriesKey: string) {
  return snapshot.series.find((point) => point.seriesKey === seriesKey) ?? null;
}

function getSeriesValue(snapshot: MacroRegimeSnapshot, seriesKey: string) {
  return getSeriesPoint(snapshot, seriesKey)?.value ?? null;
}

function getPreviousSeriesValue(series: MacroSeries[], seriesKey: string) {
  const ordered = [...series]
    .filter((point) => point.seriesKey === seriesKey)
    .sort((left, right) => right.observationDate.getTime() - left.observationDate.getTime());
  return ordered[1]?.value ?? null;
}

function buildInputsList(items: Array<string | null>) {
  return items.filter((item): item is string => Boolean(item));
}

function buildFactorPoint(
  input: Omit<MacroFactorPoint, 'value' | 'isObserved'> & { value: number | null }
) {
  const isObserved = input.value !== null;
  return {
    ...input,
    isObserved,
    value: isObserved && input.value !== null ? round(input.value) : null
  };
}

export function buildMacroFactorSnapshot(input: {
  market: string;
  marketSnapshot?: MarketSnapshot | null;
  series?: MacroSeries[];
}): MacroFactorSnapshot {
  const snapshot = buildSnapshot(input);
  const series = input.series ?? [];
  const th = getMarketFactorThresholds(input.market);
  const inv = getMarketInvertedThresholds(input.market);

  const inflation =
    getSeriesValue(snapshot, 'inflation_pct') ?? input.marketSnapshot?.inflationPct ?? null;
  const policyRate = getSeriesValue(snapshot, 'policy_rate_pct');
  const debtCost =
    getSeriesValue(snapshot, 'debt_cost_pct') ?? input.marketSnapshot?.debtCostPct ?? null;
  const discountRate =
    getSeriesValue(snapshot, 'discount_rate_pct') ?? input.marketSnapshot?.discountRatePct ?? null;
  const creditSpread = getSeriesValue(snapshot, 'credit_spread_bps');
  const transactionVolume = getSeriesValue(snapshot, 'transaction_volume_index');
  const rentGrowth = getSeriesValue(snapshot, 'rent_growth_pct');
  const vacancy =
    getSeriesValue(snapshot, 'vacancy_pct') ?? input.marketSnapshot?.vacancyPct ?? null;
  const constructionCostIndex = getSeriesValue(snapshot, 'construction_cost_index');

  const previousPolicyRate = getPreviousSeriesValue(series, 'policy_rate_pct');
  const previousDebtCost = getPreviousSeriesValue(series, 'debt_cost_pct');
  const previousDiscountRate = getPreviousSeriesValue(series, 'discount_rate_pct');

  const rateLevel = [policyRate, debtCost, discountRate].filter(
    (value): value is number => value != null
  );
  const averageRateLevel =
    rateLevel.length > 0
      ? rateLevel.reduce((sum, value) => sum + value, 0) / rateLevel.length
      : null;

  const rateMomentumCandidates = [
    policyRate != null && previousPolicyRate != null
      ? (policyRate - previousPolicyRate) * 100
      : null,
    debtCost != null && previousDebtCost != null ? (debtCost - previousDebtCost) * 100 : null,
    discountRate != null && previousDiscountRate != null
      ? (discountRate - previousDiscountRate) * 100
      : null
  ].filter((value): value is number => value != null);
  const rateMomentumBps =
    rateMomentumCandidates.length > 0
      ? rateMomentumCandidates.reduce((sum, value) => sum + value, 0) /
        rateMomentumCandidates.length
      : 0;

  const constructionPressure =
    (constructionCostIndex != null ? constructionCostIndex - 100 : 0) +
    (inflation != null ? inflation * 4 : 0);
  const propertyDemand =
    (rentGrowth != null ? rentGrowth * 10 : 0) +
    (transactionVolume != null ? (transactionVolume - 100) * 0.6 : 0) -
    (vacancy != null ? vacancy * 2.5 : 0);

  const factors: MacroFactorPoint[] = [
    buildFactorPoint({
      key: 'inflation_trend',
      label: 'Inflation Trend',
      value: inflation,
      unit: '%',
      direction:
        inflation == null
          ? 'NEUTRAL'
          : inflation >= th.inflation.negativeAbove
            ? 'NEGATIVE'
            : inflation <= th.inflation.positiveBelow
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        inflation == null
          ? 'No current inflation observation is available.'
          : inflation >= 3.5
            ? 'Inflation pressure is still elevated.'
            : inflation <= 2.3
              ? 'Inflation looks relatively contained.'
              : 'Inflation is moderating but not fully benign.',
      inputs: buildInputsList([
        inflation != null ? `Inflation ${round(inflation)}%` : 'No current observation'
      ])
    }),
    buildFactorPoint({
      key: 'rate_level',
      label: 'Rate Level',
      value: averageRateLevel,
      unit: '%',
      direction:
        averageRateLevel == null
          ? 'NEUTRAL'
          : averageRateLevel >= th.rateLevel.negativeAbove
            ? 'NEGATIVE'
            : averageRateLevel <= th.rateLevel.positiveBelow
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        averageRateLevel == null
          ? 'No current rate-level observation is available.'
          : averageRateLevel >= 6
            ? 'Funding and discount rates are high.'
            : averageRateLevel <= 4.5
              ? 'Rate levels are comparatively supportive.'
              : 'Rate levels are workable but not easy.',
      inputs: buildInputsList([
        policyRate != null ? `Policy ${round(policyRate)}%` : null,
        debtCost != null ? `Debt ${round(debtCost)}%` : null,
        discountRate != null ? `Discount ${round(discountRate)}%` : null
      ])
    }),
    buildFactorPoint({
      key: 'rate_momentum_bps',
      label: 'Rate Momentum',
      value: rateMomentumCandidates.length > 0 ? rateMomentumBps : null,
      unit: 'bps',
      direction:
        rateMomentumCandidates.length === 0
          ? 'NEUTRAL'
          : rateMomentumBps >= th.rateMomentumBps.negativeAbove
            ? 'NEGATIVE'
            : rateMomentumBps <= th.rateMomentumBps.positiveBelow
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        rateMomentumCandidates.length === 0
          ? 'No prior series observation is available to measure rate momentum.'
          : rateMomentumBps >= 25
            ? 'Rates are still moving higher.'
            : rateMomentumBps <= -25
              ? 'Rates are easing versus the prior reading.'
              : 'Rates are broadly stable versus the prior reading.',
      inputs: buildInputsList([
        previousPolicyRate != null && policyRate != null
          ? `Policy delta ${round((policyRate - previousPolicyRate) * 100)} bps`
          : null,
        previousDebtCost != null && debtCost != null
          ? `Debt delta ${round((debtCost - previousDebtCost) * 100)} bps`
          : null,
        previousDiscountRate != null && discountRate != null
          ? `Discount delta ${round((discountRate - previousDiscountRate) * 100)} bps`
          : null,
        rateMomentumCandidates.length === 0 ? 'No prior observation' : null
      ])
    }),
    buildFactorPoint({
      key: 'credit_stress',
      label: 'Credit Stress',
      value: creditSpread,
      unit: 'bps',
      direction:
        creditSpread == null
          ? 'NEUTRAL'
          : creditSpread >= th.creditSpreadBps.negativeAbove
            ? 'NEGATIVE'
            : creditSpread <= th.creditSpreadBps.positiveBelow
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        creditSpread == null
          ? 'No current credit-spread observation is available.'
          : creditSpread >= 220
            ? 'Credit conditions look stressed.'
            : creditSpread <= 150
              ? 'Credit spreads look constructive.'
              : 'Credit spreads are in a middle band.',
      inputs: buildInputsList([
        creditSpread != null ? `Spread ${round(creditSpread)} bps` : 'No current observation'
      ])
    }),
    buildFactorPoint({
      key: 'liquidity',
      label: 'Liquidity',
      value: transactionVolume,
      unit: 'idx',
      direction:
        transactionVolume == null
          ? 'NEUTRAL'
          : transactionVolume < inv.liquidity.negativeBelow
            ? 'NEGATIVE'
            : transactionVolume >= inv.liquidity.positiveAbove
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        transactionVolume == null
          ? 'No current transaction-liquidity observation is available.'
          : transactionVolume < 85
            ? 'Exit and transaction liquidity look thin.'
            : transactionVolume >= 105
              ? 'Transaction liquidity looks healthy.'
              : 'Transaction liquidity is serviceable.',
      inputs: buildInputsList([
        transactionVolume != null
          ? `Volume index ${round(transactionVolume)}`
          : 'No current observation'
      ])
    }),
    buildFactorPoint({
      key: 'growth_momentum',
      label: 'Growth Momentum',
      value: rentGrowth,
      unit: '%',
      direction:
        rentGrowth == null
          ? 'NEUTRAL'
          : rentGrowth < inv.rentGrowth.negativeBelow
            ? 'NEGATIVE'
            : rentGrowth >= inv.rentGrowth.positiveAbove
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        rentGrowth == null
          ? 'No current growth observation is available.'
          : rentGrowth < 1
            ? 'Growth looks weak.'
            : rentGrowth >= 2.5
              ? 'Growth looks supportive.'
              : 'Growth is modest.',
      inputs: buildInputsList([
        rentGrowth != null ? `Rent growth ${round(rentGrowth)}%` : 'No current observation'
      ])
    }),
    buildFactorPoint({
      key: 'construction_pressure',
      label: 'Construction Pressure',
      value: inflation == null && constructionCostIndex == null ? null : constructionPressure,
      unit: 'score',
      direction:
        inflation == null && constructionCostIndex == null
          ? 'NEUTRAL'
          : constructionPressure >= th.constructionPressure.negativeAbove
            ? 'NEGATIVE'
            : constructionPressure <= th.constructionPressure.positiveBelow
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        inflation == null && constructionCostIndex == null
          ? 'No current construction-cost observation is available.'
          : constructionPressure >= 25
            ? 'Construction inputs remain under pressure.'
            : constructionPressure <= 10
              ? 'Construction pressure is relatively contained.'
              : 'Construction pressure is elevated but not extreme.',
      inputs: buildInputsList([
        inflation != null ? `Inflation ${round(inflation)}%` : null,
        constructionCostIndex != null ? `Cost index ${round(constructionCostIndex)}` : null,
        inflation == null && constructionCostIndex == null ? 'No current observation' : null
      ])
    }),
    buildFactorPoint({
      key: 'property_demand',
      label: 'Property Demand',
      value:
        rentGrowth == null && transactionVolume == null && vacancy == null ? null : propertyDemand,
      unit: 'score',
      direction:
        rentGrowth == null && transactionVolume == null && vacancy == null
          ? 'NEUTRAL'
          : propertyDemand <= inv.propertyDemand.negativeBelow
            ? 'NEGATIVE'
            : propertyDemand >= inv.propertyDemand.positiveAbove
              ? 'POSITIVE'
              : 'NEUTRAL',
      commentary:
        rentGrowth == null && transactionVolume == null && vacancy == null
          ? 'No current leasing-demand observation is available.'
          : propertyDemand <= -10
            ? 'Leasing demand looks weak.'
            : propertyDemand >= 8
              ? 'Leasing demand looks constructive.'
              : 'Property demand looks balanced.',
      inputs: buildInputsList([
        vacancy != null ? `Vacancy ${round(vacancy)}%` : null,
        rentGrowth != null ? `Rent growth ${round(rentGrowth)}%` : null,
        transactionVolume != null ? `Volume index ${round(transactionVolume)}` : null,
        rentGrowth == null && transactionVolume == null && vacancy == null
          ? 'No current observation'
          : null
      ])
    })
  ];

  const trendMap = buildFactorTrendMap(series);
  for (const factor of factors) {
    const trendMeta = trendMap[factor.key];
    if (trendMeta) {
      factor.trend = trendMeta;
    }
  }

  return {
    market: snapshot.market,
    asOf: snapshot.asOf,
    factors
  };
}

export function getMacroFactorValue(snapshot: MacroFactorSnapshot, key: MacroFactorKey) {
  const point = snapshot.factors.find((factor) => factor.key === key);
  if (!point || !point.isObserved) return null;
  return point.value;
}

export function buildMacroFactorCreateInputs(input: {
  market: string;
  marketSnapshot?: MarketSnapshot | null;
  series?: MacroSeries[];
  sourceSystem: string;
  sourceStatus: SourceStatus;
  sourceUpdatedAt: Date;
  observationDate?: Date;
}) {
  const snapshot = buildMacroFactorSnapshot({
    market: input.market,
    marketSnapshot: input.marketSnapshot,
    series: input.series
  });
  const observationDate =
    input.observationDate ?? (snapshot.asOf ? new Date(snapshot.asOf) : input.sourceUpdatedAt);

  return snapshot.factors
    .filter(
      (factor): factor is typeof factor & { value: number } =>
        factor.isObserved && factor.value !== null
    )
    .map((factor) => ({
      market: input.market,
      factorKey: factor.key,
      label: factor.label,
      observationDate,
      value: factor.value,
      unit: factor.unit,
      direction: factor.direction,
      commentary: factor.commentary,
      sourceSystem: input.sourceSystem,
      sourceStatus: input.sourceStatus,
      sourceUpdatedAt: input.sourceUpdatedAt,
      trendDirection: factor.trend?.direction ?? null,
      trendMomentum: factor.trend?.momentum ?? null,
      trendAcceleration: factor.trend?.acceleration ?? null,
      anomalyZScore: factor.trend?.anomalyZScore ?? null,
      movingAvg3: factor.trend?.movingAvg3 ?? null,
      movingAvg6: factor.trend?.movingAvg6 ?? null,
      movingAvg12: factor.trend?.movingAvg12 ?? null
    }));
}
