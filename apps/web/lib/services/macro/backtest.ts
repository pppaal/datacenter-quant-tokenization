import type { MacroFactor } from '@prisma/client';

type MacroDirection = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type MacroBacktestFactorRow = {
  factorKey: string;
  label: string;
  transitionCount: number;
  hitRatePct: number;
  latestDirection: MacroDirection;
  latestObservationDate: string | null;
};

export type MacroBacktestMarketRow = {
  market: string;
  transitionCount: number;
  factorCoverage: number;
  hitRatePct: number;
  stableFactorCount: number;
  unstableFactorCount: number;
  latestObservationDate: string | null;
  bestFactor: MacroBacktestFactorRow | null;
  weakestFactor: MacroBacktestFactorRow | null;
  factors: MacroBacktestFactorRow[];
};

export type MacroBacktest = {
  summary: {
    marketCoverage: number;
    totalTransitions: number;
    overallHitRatePct: number;
    stableMarkets: number;
    unstableMarkets: number;
    latestObservationDate: string | null;
  };
  markets: MacroBacktestMarketRow[];
};

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

function buildFactorBacktest(rows: MacroFactor[]): MacroBacktestFactorRow | null {
  const ordered = [...rows].sort(
    (left, right) => left.observationDate.getTime() - right.observationDate.getTime()
  );
  if (ordered.length < 2) return null;

  let hits = 0;
  let transitions = 0;

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (!current || !next) continue;
    transitions += 1;
    if (current.direction === next.direction) {
      hits += 1;
    }
  }

  const latest = ordered.at(-1);

  return {
    factorKey: ordered[0]?.factorKey ?? 'unknown',
    label: ordered[0]?.label ?? 'Unknown factor',
    transitionCount: transitions,
    hitRatePct: transitions > 0 ? round((hits / transitions) * 100) : 0,
    latestDirection: (latest?.direction as MacroDirection | undefined) ?? 'NEUTRAL',
    latestObservationDate: latest?.observationDate.toISOString() ?? null
  };
}

export function buildMacroBacktest(factors: MacroFactor[]): MacroBacktest {
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
        .map((rows) => buildFactorBacktest(rows))
        .filter((row): row is MacroBacktestFactorRow => row !== null)
        .sort(
          (left, right) =>
            right.hitRatePct - left.hitRatePct || right.transitionCount - left.transitionCount
        );

      const transitionCount = factorRows.reduce((sum, row) => sum + row.transitionCount, 0);
      const weightedHitRate =
        transitionCount > 0
          ? factorRows.reduce((sum, row) => sum + row.hitRatePct * row.transitionCount, 0) /
            transitionCount
          : 0;
      const latestObservationDate =
        factorRows
          .map((row) => row.latestObservationDate)
          .filter((item): item is string => Boolean(item))
          .sort()
          .at(-1) ?? null;

      return {
        market,
        transitionCount,
        factorCoverage: factorRows.length,
        hitRatePct: round(weightedHitRate),
        stableFactorCount: factorRows.filter((row) => row.hitRatePct >= 70).length,
        unstableFactorCount: factorRows.filter((row) => row.hitRatePct <= 45).length,
        latestObservationDate,
        bestFactor: factorRows[0] ?? null,
        weakestFactor:
          [...factorRows].sort(
            (left, right) =>
              left.hitRatePct - right.hitRatePct || right.transitionCount - left.transitionCount
          )[0] ?? null,
        factors: factorRows
      } satisfies MacroBacktestMarketRow;
    })
    .sort(
      (left, right) =>
        right.hitRatePct - left.hitRatePct || right.transitionCount - left.transitionCount
    );

  const totalTransitions = markets.reduce((sum, market) => sum + market.transitionCount, 0);
  const overallHitRatePct =
    totalTransitions > 0
      ? round(
          markets.reduce((sum, market) => sum + market.hitRatePct * market.transitionCount, 0) /
            totalTransitions
        )
      : 0;

  return {
    summary: {
      marketCoverage: markets.length,
      totalTransitions,
      overallHitRatePct,
      stableMarkets: markets.filter((market) => market.hitRatePct >= 70).length,
      unstableMarkets: markets.filter((market) => market.hitRatePct <= 45).length,
      latestObservationDate:
        markets
          .map((market) => market.latestObservationDate)
          .filter((item): item is string => Boolean(item))
          .sort()
          .at(-1) ?? null
    },
    markets
  };
}
