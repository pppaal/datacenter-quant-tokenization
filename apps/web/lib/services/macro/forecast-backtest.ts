import type { MacroFactor } from '@prisma/client';

import { round } from '@/lib/math';

export type MacroForecastBacktestFactorRow = {
  factorKey: string;
  label: string;
  sampleCount: number;
  directionalHitRatePct: number;
  meanAbsoluteErrorPct: number;
  /**
   * MAE of a naive random-walk (persistence) baseline that predicts NO change
   * (next == current). This is the honest reference the momentum forecast must
   * beat: directionalHitRatePct / meanAbsoluteErrorPct in a vacuum say nothing
   * about skill until they are compared to "do nothing".
   */
  baselineMeanAbsoluteErrorPct: number;
  /**
   * Forecast skill vs the naive baseline: 1 - momentumMAE / baselineMAE.
   *   > 0  → the momentum forecast beats persistence (genuine skill),
   *   = 0  → no better than doing nothing,
   *   < 0  → WORSE than persistence,
   *   null → baseline error is ~0 (degenerate flat series; skill undefined).
   */
  skillVsNaivePct: number | null;
  latestActualDate: string | null;
};

export type MacroForecastBacktestMarketRow = {
  market: string;
  sampleCount: number;
  factorCoverage: number;
  directionalHitRatePct: number;
  meanAbsoluteErrorPct: number;
  /** Sample-weighted naive persistence baseline MAE across the market's factors. */
  baselineMeanAbsoluteErrorPct: number;
  /** Sample-weighted forecast skill vs naive across the market's factors. */
  skillVsNaivePct: number | null;
  latestActualDate: string | null;
  strongestFactor: MacroForecastBacktestFactorRow | null;
  weakestFactor: MacroForecastBacktestFactorRow | null;
  factors: MacroForecastBacktestFactorRow[];
};

export type MacroForecastBacktest = {
  summary: {
    marketCoverage: number;
    sampleCount: number;
    directionalHitRatePct: number;
    meanAbsoluteErrorPct: number;
    /** Sample-weighted naive persistence baseline MAE across all markets. */
    baselineMeanAbsoluteErrorPct: number;
    /** Sample-weighted forecast skill vs naive across all markets. */
    skillVsNaivePct: number | null;
    latestActualDate: string | null;
  };
  markets: MacroForecastBacktestMarketRow[];
};

function sign(value: number) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * Skill score = 1 - forecastMAE / baselineMAE, expressed in percent.
 * Returns null when the baseline error is ~0 (skill is undefined / degenerate).
 */
function skillVsNaivePct(forecastMae: number, baselineMae: number): number | null {
  if (baselineMae <= 1e-9) return null;
  return round((1 - forecastMae / baselineMae) * 100);
}

/**
 * Sample-weighted aggregation of per-row skill. We aggregate the underlying MAEs
 * (not the per-row skill ratios) so the aggregate skill is the skill of the
 * pooled errors, which is the statistically correct roll-up.
 */
function aggregateSkill<
  T extends { meanAbsoluteErrorPct: number; baselineMeanAbsoluteErrorPct: number }
>(rows: T[], weightOf: (row: T) => number): number | null {
  let weight = 0;
  let forecast = 0;
  let baseline = 0;
  for (const row of rows) {
    const w = weightOf(row);
    weight += w;
    forecast += row.meanAbsoluteErrorPct * w;
    baseline += row.baselineMeanAbsoluteErrorPct * w;
  }
  if (weight <= 0) return null;
  return skillVsNaivePct(forecast / weight, baseline / weight);
}

function buildFactorRow(rows: MacroFactor[]): MacroForecastBacktestFactorRow | null {
  const ordered = [...rows].sort(
    (left, right) => left.observationDate.getTime() - right.observationDate.getTime()
  );
  if (ordered.length < 3) return null;

  let sampleCount = 0;
  let hitCount = 0;
  let absErrorSum = 0;
  // Naive random-walk (persistence) baseline: predict next == current, i.e. a
  // zero forecast delta. Its error is |next - current| on the same scale.
  let baselineAbsErrorSum = 0;

  for (let index = 1; index < ordered.length - 1; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const next = ordered[index + 1];
    if (!previous || !current || !next) continue;

    const predictedNextValue = current.value + (current.value - previous.value);
    const predictedDelta = predictedNextValue - current.value;
    const actualDelta = next.value - current.value;
    const scale = Math.max(Math.abs(current.value), 1);

    sampleCount += 1;
    if (sign(predictedDelta) === sign(actualDelta)) {
      hitCount += 1;
    }
    absErrorSum += (Math.abs(predictedNextValue - next.value) / scale) * 100;
    // Persistence forecast is current.value (no change) → error = |next - current|.
    baselineAbsErrorSum += (Math.abs(current.value - next.value) / scale) * 100;
  }

  const latest = ordered.at(-1);
  const meanAbsoluteErrorPct = sampleCount > 0 ? round(absErrorSum / sampleCount) : 0;
  const baselineMeanAbsoluteErrorPct =
    sampleCount > 0 ? round(baselineAbsErrorSum / sampleCount) : 0;

  return {
    factorKey: ordered[0]?.factorKey ?? 'unknown',
    label: ordered[0]?.label ?? 'Unknown factor',
    sampleCount,
    directionalHitRatePct: sampleCount > 0 ? round((hitCount / sampleCount) * 100) : 0,
    meanAbsoluteErrorPct,
    baselineMeanAbsoluteErrorPct,
    skillVsNaivePct:
      sampleCount > 0 ? skillVsNaivePct(meanAbsoluteErrorPct, baselineMeanAbsoluteErrorPct) : null,
    latestActualDate: latest?.observationDate.toISOString() ?? null
  };
}

export function buildMacroForecastBacktest(factors: MacroFactor[]): MacroForecastBacktest {
  const byMarket = new Map<string, Map<string, MacroFactor[]>>();

  for (const factor of factors) {
    const marketMap = byMarket.get(factor.market) ?? new Map<string, MacroFactor[]>();
    const factorRows = marketMap.get(factor.factorKey) ?? [];
    factorRows.push(factor);
    marketMap.set(factor.factorKey, factorRows);
    byMarket.set(factor.market, marketMap);
  }

  const markets = [...byMarket.entries()]
    .map(([market, factorMap]) => {
      const factorRows = [...factorMap.values()]
        .map((rows) => buildFactorRow(rows))
        .filter((row): row is MacroForecastBacktestFactorRow => row !== null)
        .sort(
          (left, right) =>
            right.directionalHitRatePct - left.directionalHitRatePct ||
            left.meanAbsoluteErrorPct - right.meanAbsoluteErrorPct
        );

      const sampleCount = factorRows.reduce((sum, row) => sum + row.sampleCount, 0);
      const weightedHitRate =
        sampleCount > 0
          ? factorRows.reduce((sum, row) => sum + row.directionalHitRatePct * row.sampleCount, 0) /
            sampleCount
          : 0;
      const weightedMae =
        sampleCount > 0
          ? factorRows.reduce((sum, row) => sum + row.meanAbsoluteErrorPct * row.sampleCount, 0) /
            sampleCount
          : 0;
      const weightedBaselineMae =
        sampleCount > 0
          ? factorRows.reduce(
              (sum, row) => sum + row.baselineMeanAbsoluteErrorPct * row.sampleCount,
              0
            ) / sampleCount
          : 0;
      const latestActualDate =
        factorRows
          .map((row) => row.latestActualDate)
          .filter((item): item is string => Boolean(item))
          .sort()
          .at(-1) ?? null;

      return {
        market,
        sampleCount,
        factorCoverage: factorRows.length,
        directionalHitRatePct: round(weightedHitRate),
        meanAbsoluteErrorPct: round(weightedMae),
        baselineMeanAbsoluteErrorPct: round(weightedBaselineMae),
        skillVsNaivePct: aggregateSkill(factorRows, (row) => row.sampleCount),
        latestActualDate,
        strongestFactor: factorRows[0] ?? null,
        weakestFactor:
          [...factorRows].sort(
            (left, right) =>
              left.directionalHitRatePct - right.directionalHitRatePct ||
              right.meanAbsoluteErrorPct - left.meanAbsoluteErrorPct
          )[0] ?? null,
        factors: factorRows
      } satisfies MacroForecastBacktestMarketRow;
    })
    .sort(
      (left, right) =>
        right.directionalHitRatePct - left.directionalHitRatePct ||
        left.meanAbsoluteErrorPct - right.meanAbsoluteErrorPct
    );

  const sampleCount = markets.reduce((sum, market) => sum + market.sampleCount, 0);
  const weightedHitRate =
    sampleCount > 0
      ? markets.reduce(
          (sum, market) => sum + market.directionalHitRatePct * market.sampleCount,
          0
        ) / sampleCount
      : 0;
  const weightedMae =
    sampleCount > 0
      ? markets.reduce((sum, market) => sum + market.meanAbsoluteErrorPct * market.sampleCount, 0) /
        sampleCount
      : 0;
  const weightedBaselineMae =
    sampleCount > 0
      ? markets.reduce(
          (sum, market) => sum + market.baselineMeanAbsoluteErrorPct * market.sampleCount,
          0
        ) / sampleCount
      : 0;

  return {
    summary: {
      marketCoverage: markets.length,
      sampleCount,
      directionalHitRatePct: round(weightedHitRate),
      meanAbsoluteErrorPct: round(weightedMae),
      baselineMeanAbsoluteErrorPct: round(weightedBaselineMae),
      skillVsNaivePct: aggregateSkill(markets, (market) => market.sampleCount),
      latestActualDate:
        markets
          .map((market) => market.latestActualDate)
          .filter((item): item is string => Boolean(item))
          .sort()
          .at(-1) ?? null
    },
    markets
  };
}
