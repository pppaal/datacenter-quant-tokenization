import type { MacroSeries } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrendWindowSize = 3 | 6 | 12;

export type TrendDirection =
  | 'ACCELERATING_UP'
  | 'RISING'
  | 'FLAT'
  | 'DECLINING'
  | 'ACCELERATING_DOWN';

export type RollingStats = {
  seriesKey: string;
  window: TrendWindowSize;
  mean: number;
  stdDev: number;
  count: number;
  isComplete: boolean;
};

export type AnomalyFlag = {
  seriesKey: string;
  zScore: number;
  rollingMean: number;
  rollingStdDev: number;
  currentValue: number;
  isAnomaly: boolean;
  severity: 'MILD' | 'MODERATE' | 'EXTREME';
};

export type TrendAnalysis = {
  seriesKey: string;
  label: string;
  direction: TrendDirection;
  momentum: number;
  acceleration: number;
  movingAverages: Record<TrendWindowSize, number | null>;
  anomaly: AnomalyFlag | null;
  observationCount: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractSortedValues(series: MacroSeries[], seriesKey: string): number[] {
  return series
    .filter((s) => s.seriesKey === seriesKey && s.value != null)
    .sort((a, b) => b.observationDate.getTime() - a.observationDate.getTime())
    .map((s) => s.value!);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Ordinary least squares slope: y = a + b*x where x = 0,1,2,...
 * Values are ordered most-recent-first, so we reverse for chronological x-axis.
 */
function olsSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const chronological = [...values].reverse();
  const n = chronological.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(chronological);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (chronological[i]! - yMean);
    denominator += (i - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function classifyDirection(momentum: number, acceleration: number): TrendDirection {
  const absMom = Math.abs(momentum);
  if (absMom < 0.05) return 'FLAT';
  if (momentum > 0) {
    return acceleration > 0.02 ? 'ACCELERATING_UP' : 'RISING';
  }
  return acceleration < -0.02 ? 'ACCELERATING_DOWN' : 'DECLINING';
}

const SERIES_LABELS: Record<string, string> = {
  inflation_pct: 'Inflation',
  policy_rate_pct: 'Policy Rate',
  debt_cost_pct: 'Debt Cost',
  discount_rate_pct: 'Discount Rate',
  vacancy_pct: 'Vacancy',
  credit_spread_bps: 'Credit Spread',
  rent_growth_pct: 'Rent Growth',
  transaction_volume_index: 'Transaction Volume',
  construction_cost_index: 'Construction Cost',
  cap_rate_pct: 'Cap Rate'
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeRollingStats(
  series: MacroSeries[],
  seriesKey: string,
  window: TrendWindowSize
): RollingStats {
  const values = extractSortedValues(series, seriesKey).slice(0, window);
  return {
    seriesKey,
    window,
    mean: values.length > 0 ? mean(values) : 0,
    stdDev: sampleStdDev(values),
    count: values.length,
    isComplete: values.length >= window
  };
}

export function detectAnomaly(
  series: MacroSeries[],
  seriesKey: string,
  window: TrendWindowSize = 6
): AnomalyFlag | null {
  const values = extractSortedValues(series, seriesKey);
  if (values.length < 3) return null;

  const current = values[0]!;
  const historical = values.slice(1, window + 1);
  if (historical.length < 2) return null;

  const m = mean(historical);
  const sd = sampleStdDev(historical);
  if (sd === 0) return null;

  const zScore = (current - m) / sd;
  const absZ = Math.abs(zScore);

  return {
    seriesKey,
    zScore: Number(zScore.toFixed(3)),
    rollingMean: Number(m.toFixed(4)),
    rollingStdDev: Number(sd.toFixed(4)),
    currentValue: current,
    isAnomaly: absZ >= 2.0,
    severity: absZ >= 3.0 ? 'EXTREME' : absZ >= 2.0 ? 'MODERATE' : 'MILD'
  };
}

export function detectTrend(
  series: MacroSeries[],
  seriesKey: string,
  window: TrendWindowSize = 6
): TrendAnalysis {
  const values = extractSortedValues(series, seriesKey);
  const windowValues = values.slice(0, window);

  const momentum = olsSlope(windowValues);

  // Acceleration: difference of slopes between the first and second halves
  const halfLen = Math.max(2, Math.floor(windowValues.length / 2));
  const recentHalf = windowValues.slice(0, halfLen);
  const olderHalf = windowValues.slice(halfLen, halfLen * 2);
  const acceleration =
    recentHalf.length >= 2 && olderHalf.length >= 2
      ? olsSlope(recentHalf) - olsSlope(olderHalf)
      : 0;

  const ma3 = values.length >= 3 ? mean(values.slice(0, 3)) : null;
  const ma6 = values.length >= 6 ? mean(values.slice(0, 6)) : null;
  const ma12 = values.length >= 12 ? mean(values.slice(0, 12)) : null;

  const anomaly = detectAnomaly(series, seriesKey, window);

  return {
    seriesKey,
    label: SERIES_LABELS[seriesKey] ?? seriesKey,
    direction: classifyDirection(momentum, acceleration),
    momentum: Number(momentum.toFixed(4)),
    acceleration: Number(acceleration.toFixed(4)),
    movingAverages: {
      3: ma3 != null ? Number(ma3.toFixed(4)) : null,
      6: ma6 != null ? Number(ma6.toFixed(4)) : null,
      12: ma12 != null ? Number(ma12.toFixed(4)) : null
    },
    anomaly,
    observationCount: values.length
  };
}

export function buildFullTrendAnalysis(series: MacroSeries[]): TrendAnalysis[] {
  const uniqueKeys = [...new Set(series.filter((s) => s.value != null).map((s) => s.seriesKey))];
  return uniqueKeys.map((key) => detectTrend(series, key));
}

/**
 * Compact trend summary for factor-level attachment: picks the primary
 * series key that each macro factor is derived from and returns a lookup map.
 */
const FACTOR_PRIMARY_SERIES: Record<string, string> = {
  inflation_trend: 'inflation_pct',
  rate_level: 'policy_rate_pct',
  rate_momentum_bps: 'policy_rate_pct',
  credit_stress: 'credit_spread_bps',
  liquidity: 'transaction_volume_index',
  growth_momentum: 'rent_growth_pct',
  construction_pressure: 'construction_cost_index',
  property_demand: 'vacancy_pct'
};

export type FactorTrendMetadata = {
  direction: TrendDirection;
  momentum: number;
  acceleration: number;
  anomalyZScore: number | null;
  movingAvg3: number | null;
  movingAvg6: number | null;
  movingAvg12: number | null;
};

export function buildFactorTrendMap(series: MacroSeries[]): Record<string, FactorTrendMetadata> {
  const allTrends = buildFullTrendAnalysis(series);
  const trendByKey = Object.fromEntries(allTrends.map((t) => [t.seriesKey, t]));
  const result: Record<string, FactorTrendMetadata> = {};

  for (const [factorKey, seriesKey] of Object.entries(FACTOR_PRIMARY_SERIES)) {
    const trend = trendByKey[seriesKey];
    if (trend) {
      result[factorKey] = {
        direction: trend.direction,
        momentum: trend.momentum,
        acceleration: trend.acceleration,
        anomalyZScore: trend.anomaly?.zScore ?? null,
        movingAvg3: trend.movingAverages[3],
        movingAvg6: trend.movingAverages[6],
        movingAvg12: trend.movingAverages[12]
      };
    }
  }

  return result;
}
