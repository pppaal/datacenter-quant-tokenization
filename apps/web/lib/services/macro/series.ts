import type { MacroSeries, MarketSnapshot, SourceStatus } from '@prisma/client';
import type { MacroData } from '@/lib/sources/adapters/macro';
import type { ProvenanceEntry } from '@/lib/sources/types';

type MacroSeriesDefinition = {
  sourceKey: keyof Pick<
    MacroData,
    | 'inflationPct'
    | 'debtCostPct'
    | 'capRatePct'
    | 'discountRatePct'
    | 'vacancyPct'
    | 'policyRatePct'
    | 'creditSpreadBps'
    | 'rentGrowthPct'
    | 'transactionVolumeIndex'
    | 'constructionCostIndex'
  >;
  seriesKey: string;
  label: string;
  unit: string;
};

export type MacroSeriesSnapshotPoint = {
  seriesKey: string;
  label: string;
  value: number;
  unit: string | null;
  observationDate: string;
  sourceSystem: string;
  sourceStatus: string;
};

export type MacroRegimeSnapshot = {
  market: string;
  asOf: string | null;
  series: MacroSeriesSnapshotPoint[];
};

const macroSeriesDefinitions: MacroSeriesDefinition[] = [
  {
    sourceKey: 'inflationPct',
    seriesKey: 'inflation_pct',
    label: 'Inflation',
    unit: '%'
  },
  {
    sourceKey: 'debtCostPct',
    seriesKey: 'debt_cost_pct',
    label: 'Debt Cost',
    unit: '%'
  },
  {
    sourceKey: 'capRatePct',
    seriesKey: 'cap_rate_pct',
    label: 'Market Cap Rate',
    unit: '%'
  },
  {
    sourceKey: 'discountRatePct',
    seriesKey: 'discount_rate_pct',
    label: 'Discount Rate',
    unit: '%'
  },
  {
    sourceKey: 'vacancyPct',
    seriesKey: 'vacancy_pct',
    label: 'Vacancy',
    unit: '%'
  },
  {
    sourceKey: 'policyRatePct',
    seriesKey: 'policy_rate_pct',
    label: 'Policy Rate',
    unit: '%'
  },
  {
    sourceKey: 'creditSpreadBps',
    seriesKey: 'credit_spread_bps',
    label: 'Credit Spread',
    unit: 'bps'
  },
  {
    sourceKey: 'rentGrowthPct',
    seriesKey: 'rent_growth_pct',
    label: 'Rent Growth',
    unit: '%'
  },
  {
    sourceKey: 'transactionVolumeIndex',
    seriesKey: 'transaction_volume_index',
    label: 'Transaction Volume',
    unit: 'idx'
  },
  {
    sourceKey: 'constructionCostIndex',
    seriesKey: 'construction_cost_index',
    label: 'Construction Cost Index',
    unit: 'idx'
  }
];

export function normalizeMacroObservationDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function buildMacroSeriesCreateInputs(input: {
  market: string;
  macro: MacroData;
  sourceSystem: string;
  sourceStatus: SourceStatus;
  sourceUpdatedAt: Date;
  observationDate?: Date;
}) {
  const observationDate = normalizeMacroObservationDate(
    input.observationDate ?? input.sourceUpdatedAt
  );

  return macroSeriesDefinitions
    .map((definition) => {
      const rawValue = input.macro[definition.sourceKey];
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(value)) return null;

      return {
        market: input.market,
        seriesKey: definition.seriesKey,
        label: definition.label,
        frequency: 'monthly',
        observationDate,
        value,
        unit: definition.unit,
        sourceSystem: input.sourceSystem,
        sourceStatus: input.sourceStatus,
        sourceUpdatedAt: input.sourceUpdatedAt
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export function buildMacroRegimeSnapshot(series: MacroSeries[]): MacroRegimeSnapshot | null {
  if (series.length === 0) return null;

  const latestByKey = new Map<string, MacroSeries>();

  for (const point of [...series].sort(
    (left, right) => right.observationDate.getTime() - left.observationDate.getTime()
  )) {
    if (!latestByKey.has(point.seriesKey)) {
      latestByKey.set(point.seriesKey, point);
    }
  }

  const latestSeries = Array.from(latestByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );

  return {
    market: latestSeries[0]?.market ?? 'N/A',
    asOf: latestSeries[0]?.observationDate.toISOString() ?? null,
    series: latestSeries.map((point) => ({
      seriesKey: point.seriesKey,
      label: point.label,
      value: point.value,
      unit: point.unit,
      observationDate: point.observationDate.toISOString(),
      sourceSystem: point.sourceSystem,
      sourceStatus: point.sourceStatus
    }))
  };
}

export function buildMacroRegimeSnapshotFromMarketSnapshot(
  market: string,
  marketSnapshot?: MarketSnapshot | null
): MacroRegimeSnapshot | null {
  if (!marketSnapshot) return null;

  const observationTimestamp = (
    marketSnapshot.sourceUpdatedAt ?? marketSnapshot.updatedAt
  ).toISOString();
  const points: MacroSeriesSnapshotPoint[] = [
    ['inflation_pct', 'Inflation', marketSnapshot.inflationPct, '%'],
    ['debt_cost_pct', 'Debt Cost', marketSnapshot.debtCostPct, '%'],
    ['cap_rate_pct', 'Market Cap Rate', marketSnapshot.capRatePct, '%'],
    ['discount_rate_pct', 'Discount Rate', marketSnapshot.discountRatePct, '%'],
    ['vacancy_pct', 'Vacancy', marketSnapshot.vacancyPct, '%']
  ]
    .filter((entry): entry is [string, string, number, string] => typeof entry[2] === 'number')
    .map(([seriesKey, label, value, unit]) => ({
      seriesKey,
      label,
      value,
      unit,
      observationDate: observationTimestamp,
      sourceSystem: 'market-snapshot',
      sourceStatus: marketSnapshot.sourceStatus
    }));

  if (points.length === 0) return null;

  return {
    market: marketSnapshot.metroRegion ?? market,
    asOf: observationTimestamp,
    series: points
  };
}

export function buildMacroSnapshot(input: {
  market: string;
  marketSnapshot?: MarketSnapshot | null;
  series?: MacroSeries[];
}): MacroRegimeSnapshot {
  return (
    buildMacroRegimeSnapshot(input.series ?? []) ??
    buildMacroRegimeSnapshotFromMarketSnapshot(input.market, input.marketSnapshot) ?? {
      market: input.market,
      asOf: null,
      series: []
    }
  );
}

export function buildMacroRegimeProvenance(series: MacroSeries[]): ProvenanceEntry[] {
  const snapshot = buildMacroRegimeSnapshot(series);
  if (!snapshot) return [];

  return snapshot.series.map((point) => ({
    field: `macro.${point.seriesKey}`,
    value: point.value,
    sourceSystem: point.sourceSystem,
    mode:
      point.sourceStatus === 'FRESH'
        ? 'api'
        : point.sourceStatus === 'MANUAL'
          ? 'manual'
          : 'fallback',
    fetchedAt: point.observationDate,
    freshnessLabel: `${point.label} as of ${point.observationDate.slice(0, 10)}`
  }));
}
