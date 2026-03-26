import type { MacroFactor } from '@prisma/client';
import type { QuantAllocationView, QuantMarketSignal, QuantSignalStance } from '@/lib/services/macro/quant';

const MONITORED_FACTOR_KEYS = [
  'inflation_trend',
  'rate_level',
  'rate_momentum_bps',
  'credit_stress',
  'liquidity',
  'growth_momentum',
  'construction_pressure',
  'property_demand'
] as const;

type MonitoredFactorKey = (typeof MONITORED_FACTOR_KEYS)[number];

export type MacroMonitorMarketRow = {
  market: string;
  asOf: string | null;
  observedFactorCount: number;
  missingFactorCount: number;
  riskStance: QuantSignalStance | 'NEUTRAL';
  allocationStance: 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
  strongestHeadwind: string | null;
  strongestTailwind: string | null;
  headwindDrivers: string[];
  tailwindDrivers: string[];
  missingFactors: string[];
};

export type MacroMonitorDriverRow = {
  key: string;
  label: string;
  type: 'HEADWIND' | 'TAILWIND';
  marketCount: number;
};

export type MacroMonitor = {
  summary: {
    marketCoverage: number;
    stressedMarkets: number;
    supportiveMarkets: number;
    mixedMarkets: number;
    missingDataMarkets: number;
    latestAsOf: string | null;
  };
  markets: MacroMonitorMarketRow[];
  driverBoard: MacroMonitorDriverRow[];
};

function getLatestFactorMap(factors: MacroFactor[]) {
  const latestByMarket = new Map<string, Map<MonitoredFactorKey, MacroFactor>>();

  for (const factor of [...factors].sort((left, right) => right.observationDate.getTime() - left.observationDate.getTime())) {
    if (!MONITORED_FACTOR_KEYS.includes(factor.factorKey as MonitoredFactorKey)) {
      continue;
    }

    const marketMap = latestByMarket.get(factor.market) ?? new Map<MonitoredFactorKey, MacroFactor>();
    const factorKey = factor.factorKey as MonitoredFactorKey;
    if (!marketMap.has(factorKey)) {
      marketMap.set(factorKey, factor);
    }
    latestByMarket.set(factor.market, marketMap);
  }

  return latestByMarket;
}

function getSeverity(factor: MacroFactor) {
  switch (factor.factorKey as MonitoredFactorKey) {
    case 'inflation_trend':
      return Math.abs(factor.value - 2.5);
    case 'rate_level':
      return Math.abs(factor.value - 5);
    case 'rate_momentum_bps':
      return Math.abs(factor.value) / 25;
    case 'credit_stress':
      return Math.abs(factor.value - 180) / 40;
    case 'liquidity':
      return Math.abs(factor.value - 95) / 10;
    case 'growth_momentum':
      return Math.abs(factor.value - 1.8);
    case 'construction_pressure':
      return Math.abs(factor.value - 15) / 5;
    case 'property_demand':
      return Math.abs(factor.value) / 6;
    default:
      return Math.abs(factor.value);
  }
}

function getQuantSignalStance(signals: QuantMarketSignal[], market: string, key: 'risk' | 'realAssets') {
  return (
    signals.find((signal) => signal.market === market)?.signals.find((item) => item.key === key)?.stance ?? 'NEUTRAL'
  );
}

function getAllocationStance(allocation: QuantAllocationView[], market: string) {
  return allocation.find((item) => item.market === market)?.stance ?? 'NEUTRAL';
}

function pickDrivers(factors: MacroFactor[], direction: 'NEGATIVE' | 'POSITIVE') {
  return [...factors]
    .filter((factor) => factor.direction === direction)
    .sort((left, right) => getSeverity(right) - getSeverity(left))
    .slice(0, 2);
}

function buildDriverBoard(rows: MacroMonitorMarketRow[]) {
  const counts = new Map<string, MacroMonitorDriverRow>();

  for (const row of rows) {
    for (const label of row.headwindDrivers) {
      const current = counts.get(`HEADWIND:${label}`);
      counts.set(`HEADWIND:${label}`, {
        key: `HEADWIND:${label}`,
        label,
        type: 'HEADWIND',
        marketCount: (current?.marketCount ?? 0) + 1
      });
    }
    for (const label of row.tailwindDrivers) {
      const current = counts.get(`TAILWIND:${label}`);
      counts.set(`TAILWIND:${label}`, {
        key: `TAILWIND:${label}`,
        label,
        type: 'TAILWIND',
        marketCount: (current?.marketCount ?? 0) + 1
      });
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.marketCount - left.marketCount || left.label.localeCompare(right.label))
    .slice(0, 6);
}

export function buildMacroMonitor(
  factors: MacroFactor[],
  quantSignals: QuantMarketSignal[],
  quantAllocation: QuantAllocationView[]
): MacroMonitor {
  const latestByMarket = getLatestFactorMap(factors);
  const markets = [...latestByMarket.entries()]
    .map(([market, marketFactors]) => {
      const observedFactors = [...marketFactors.values()];
      const headwinds = pickDrivers(observedFactors, 'NEGATIVE');
      const tailwinds = pickDrivers(observedFactors, 'POSITIVE');
      const latestAsOf =
        observedFactors.sort((left, right) => right.observationDate.getTime() - left.observationDate.getTime())[0]
          ?.observationDate.toISOString() ?? null;

      const missingFactors = MONITORED_FACTOR_KEYS.filter((factorKey) => !marketFactors.has(factorKey)).map((factorKey) => {
        switch (factorKey) {
          case 'inflation_trend':
            return 'Inflation';
          case 'rate_level':
            return 'Rate Level';
          case 'rate_momentum_bps':
            return 'Rate Momentum';
          case 'credit_stress':
            return 'Credit Stress';
          case 'liquidity':
            return 'Liquidity';
          case 'growth_momentum':
            return 'Growth';
          case 'construction_pressure':
            return 'Construction';
          case 'property_demand':
            return 'Property Demand';
        }
      });

      return {
        market,
        asOf: latestAsOf,
        observedFactorCount: observedFactors.length,
        missingFactorCount: missingFactors.length,
        riskStance: getQuantSignalStance(quantSignals, market, 'risk'),
        allocationStance: getAllocationStance(quantAllocation, market),
        strongestHeadwind: headwinds[0]?.label ?? null,
        strongestTailwind: tailwinds[0]?.label ?? null,
        headwindDrivers: headwinds.map((factor) => factor.label),
        tailwindDrivers: tailwinds.map((factor) => factor.label),
        missingFactors
      } satisfies MacroMonitorMarketRow;
    })
    .sort((left, right) => {
      const leftAlertScore =
        (left.riskStance === 'RISK_OFF' ? 2 : 0) +
        (left.allocationStance === 'UNDERWEIGHT' ? 2 : 0) +
        left.missingFactorCount * 0.1;
      const rightAlertScore =
        (right.riskStance === 'RISK_OFF' ? 2 : 0) +
        (right.allocationStance === 'UNDERWEIGHT' ? 2 : 0) +
        right.missingFactorCount * 0.1;
      return rightAlertScore - leftAlertScore || left.market.localeCompare(right.market);
    });

  return {
    summary: {
      marketCoverage: markets.length,
      stressedMarkets: markets.filter(
        (market) => market.riskStance === 'RISK_OFF' || market.allocationStance === 'UNDERWEIGHT'
      ).length,
      supportiveMarkets: markets.filter(
        (market) => market.riskStance === 'RISK_ON' || market.allocationStance === 'OVERWEIGHT'
      ).length,
      mixedMarkets: markets.filter(
        (market) =>
          market.riskStance === 'NEUTRAL' &&
          market.allocationStance === 'NEUTRAL' &&
          market.missingFactorCount === 0
      ).length,
      missingDataMarkets: markets.filter((market) => market.missingFactorCount > 0).length,
      latestAsOf: markets
        .map((market) => market.asOf)
        .filter((item): item is string => Boolean(item))
        .sort()
        .at(-1) ?? null
    },
    markets,
    driverBoard: buildDriverBoard(markets)
  };
}
