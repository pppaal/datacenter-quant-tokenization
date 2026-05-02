import { CapexCategory, SourceStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

/**
 * Shared utilities for the seed scripts. Extracted from prisma/seed.ts so
 * domain-specific seeds (office, datacenter, ...) can re-use them without
 * the rest of the orchestration file in scope. All functions are pure
 * and accept their dependencies as parameters.
 */

export function deterministicDocumentHash(...parts: string[]): string {
  return createHash('sha256').update(parts.filter(Boolean).join(':')).digest('hex');
}

export function monthOffset(date: Date, offsetMonths: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

// Open-ended shape: the helper only reads these five fields, but seed
// scripts often pass a full marketSnapshot object literal. Index signature
// keeps excess-property checks from rejecting the full shape.
export type MarketSnapshotSeedShape = {
  vacancyPct: number;
  capRatePct: number;
  debtCostPct: number;
  inflationPct: number;
  discountRatePct: number;
  [key: string]: unknown;
};

export function buildMacroSeriesSeedRows(
  market: string,
  marketSnapshot: MarketSnapshotSeedShape,
  observationDate = new Date()
) {
  const baseDate = monthOffset(observationDate, 0);

  // 12 monthly deltas (oldest → newest) for each series key.
  // Provides enough history for trend analysis, moving averages, and anomaly detection.
  const rows: Array<[string, string, string, number, number[]]> = [
    [
      'inflation_pct',
      'Inflation',
      '%',
      marketSnapshot.inflationPct,
      [-0.6, -0.5, -0.45, -0.35, -0.3, -0.25, -0.2, -0.15, -0.12, -0.1, -0.05, 0]
    ],
    [
      'debt_cost_pct',
      'Debt Cost',
      '%',
      marketSnapshot.debtCostPct,
      [-0.8, -0.7, -0.6, -0.55, -0.45, -0.35, -0.3, -0.25, -0.2, -0.15, -0.05, 0]
    ],
    [
      'cap_rate_pct',
      'Market Cap Rate',
      '%',
      marketSnapshot.capRatePct,
      [-0.5, -0.45, -0.4, -0.35, -0.3, -0.25, -0.2, -0.15, -0.1, -0.08, -0.03, 0]
    ],
    [
      'discount_rate_pct',
      'Discount Rate',
      '%',
      marketSnapshot.discountRatePct,
      [-0.5, -0.45, -0.4, -0.35, -0.3, -0.2, -0.15, -0.12, -0.1, -0.05, -0.02, 0]
    ],
    [
      'vacancy_pct',
      'Vacancy',
      '%',
      marketSnapshot.vacancyPct,
      [1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.5, 0.4, 0.3, 0.2, 0.1, 0]
    ],
    [
      'policy_rate_pct',
      'Policy Rate',
      '%',
      3.5,
      [-0.75, -0.75, -0.5, -0.5, -0.5, -0.25, -0.25, -0.25, 0, 0, 0, 0]
    ],
    [
      'credit_spread_bps',
      'Credit Spread',
      'bps',
      180,
      [40, 35, 30, 25, 20, 15, 10, 5, 0, -5, -5, 0]
    ],
    [
      'rent_growth_pct',
      'Rent Growth',
      '%',
      2.1,
      [-0.5, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.3, 0.2, 0.1, 0.05, 0]
    ],
    [
      'transaction_volume_index',
      'Transaction Volume',
      'idx',
      98,
      [-15, -12, -10, -8, -6, -5, -4, -3, -2, -1, 0, 0]
    ],
    [
      'construction_cost_index',
      'Construction Cost',
      'idx',
      108,
      [-12, -10, -8, -7, -6, -5, -4, -3, -2, -1, -0.5, 0]
    ]
  ];

  return rows.flatMap(([seriesKey, label, unit, currentValue, deltas]) =>
    deltas.map((delta, index) => ({
      market,
      seriesKey,
      label,
      frequency: 'monthly',
      observationDate: monthOffset(baseDate, index - (deltas.length - 1)),
      value: Number((currentValue + delta).toFixed(2)),
      unit,
      sourceSystem: 'seed-manual',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: baseDate
    }))
  );
}

export function buildCapexLineItems(totalCapexKrw: number, landPct: number) {
  return [
    {
      category: CapexCategory.LAND,
      label: 'Land and assembly',
      amountKrw: totalCapexKrw * landPct,
      spendYear: 0
    },
    {
      category: CapexCategory.SHELL_CORE,
      label: 'Shell and core',
      amountKrw: totalCapexKrw * 0.22,
      spendYear: 1
    },
    {
      category: CapexCategory.ELECTRICAL,
      label: 'Electrical and utility interconnection',
      amountKrw: totalCapexKrw * 0.24,
      spendYear: 1
    },
    {
      category: CapexCategory.MECHANICAL,
      label: 'Cooling and mechanical package',
      amountKrw: totalCapexKrw * 0.16,
      spendYear: 1
    },
    {
      category: CapexCategory.IT_FIT_OUT,
      label: 'White space and fit-out',
      amountKrw: totalCapexKrw * 0.1,
      spendYear: 2
    },
    {
      category: CapexCategory.SOFT_COST,
      label: 'Professional fees and developer overhead',
      amountKrw: totalCapexKrw * 0.09,
      spendYear: 0
    },
    {
      category: CapexCategory.CONTINGENCY,
      label: 'Contingency',
      amountKrw: totalCapexKrw * (0.19 - landPct),
      spendYear: 2
    }
  ];
}
