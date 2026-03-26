import type { MacroFactor } from '@prisma/client';

export type MacroForecastBacktestFactorRow = {
  factorKey: string;
  label: string;
  sampleCount: number;
  directionalHitRatePct: number;
  meanAbsoluteErrorPct: number;
  latestActualDate: string | null;
};

export type MacroForecastBacktestMarketRow = {
  market: string;
  sampleCount: number;
  factorCoverage: number;
  directionalHitRatePct: number;
  meanAbsoluteErrorPct: number;
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
    latestActualDate: string | null;
  };
  markets: MacroForecastBacktestMarketRow[];
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function sign(value: number) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function buildFactorRow(rows: MacroFactor[]): MacroForecastBacktestFactorRow | null {
  const ordered = [...rows].sort((left, right) => left.observationDate.getTime() - right.observationDate.getTime());
  if (ordered.length < 3) return null;

  let sampleCount = 0;
  let hitCount = 0;
  let absErrorSum = 0;

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
  }

  const latest = ordered.at(-1);

  return {
    factorKey: ordered[0]?.factorKey ?? 'unknown',
    label: ordered[0]?.label ?? 'Unknown factor',
    sampleCount,
    directionalHitRatePct: sampleCount > 0 ? round((hitCount / sampleCount) * 100) : 0,
    meanAbsoluteErrorPct: sampleCount > 0 ? round(absErrorSum / sampleCount) : 0,
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
        .sort((left, right) => right.directionalHitRatePct - left.directionalHitRatePct || left.meanAbsoluteErrorPct - right.meanAbsoluteErrorPct);

      const sampleCount = factorRows.reduce((sum, row) => sum + row.sampleCount, 0);
      const weightedHitRate =
        sampleCount > 0
          ? factorRows.reduce((sum, row) => sum + row.directionalHitRatePct * row.sampleCount, 0) / sampleCount
          : 0;
      const weightedMae =
        sampleCount > 0
          ? factorRows.reduce((sum, row) => sum + row.meanAbsoluteErrorPct * row.sampleCount, 0) / sampleCount
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
        latestActualDate,
        strongestFactor: factorRows[0] ?? null,
        weakestFactor:
          [...factorRows].sort((left, right) => left.directionalHitRatePct - right.directionalHitRatePct || right.meanAbsoluteErrorPct - left.meanAbsoluteErrorPct)[0] ??
          null,
        factors: factorRows
      } satisfies MacroForecastBacktestMarketRow;
    })
    .sort((left, right) => right.directionalHitRatePct - left.directionalHitRatePct || left.meanAbsoluteErrorPct - right.meanAbsoluteErrorPct);

  const sampleCount = markets.reduce((sum, market) => sum + market.sampleCount, 0);
  const weightedHitRate =
    sampleCount > 0
      ? markets.reduce((sum, market) => sum + market.directionalHitRatePct * market.sampleCount, 0) / sampleCount
      : 0;
  const weightedMae =
    sampleCount > 0
      ? markets.reduce((sum, market) => sum + market.meanAbsoluteErrorPct * market.sampleCount, 0) / sampleCount
      : 0;

  return {
    summary: {
      marketCoverage: markets.length,
      sampleCount,
      directionalHitRatePct: round(weightedHitRate),
      meanAbsoluteErrorPct: round(weightedMae),
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
