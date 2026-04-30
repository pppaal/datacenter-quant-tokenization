/**
 * Submarket × asset-class × tier cap-rate aggregator.
 *
 * Produces CBRE-style "Yeouido Prime 4.6%, Grade A 5.1%, Grade B 5.8%"
 * matrices from the rows in TransactionComp + MarketIndicatorSeries.
 * Two sources because the underlying data has different shapes:
 *
 *   TransactionComp        — actual deal-level cap rates derived from
 *                            transaction price + NOI. Sparse but
 *                            ground-truth.
 *   MarketIndicatorSeries  — REB / MOLIT-published market caps and
 *                            vacancy / rent benchmarks. Denser but
 *                            aggregate.
 *
 * The aggregator returns both, side-by-side, so the operator can
 * cross-check one against the other — divergence between deal-level
 * cap rates and the published market median is itself a useful
 * signal.
 */
import type { AssetClass, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

export type CapRateBucket = {
  market: string;
  region: string | null;
  assetClass: AssetClass | null;
  assetTier: string | null;
  count: number;
  minPct: number;
  medianPct: number;
  maxPct: number;
  /** Latest observation date in the bucket; useful for freshness flags. */
  latestObservedAt: Date | null;
};

export type CapRateAggregation = {
  fromTransactions: CapRateBucket[];
  fromIndicators: CapRateBucket[];
  totals: {
    transactionRows: number;
    indicatorRows: number;
    distinctMarkets: number;
    distinctSubmarkets: number;
  };
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

type GroupKey = string;

function bucketKey(row: {
  market: string;
  region: string | null;
  assetClass: AssetClass | null;
  assetTier: string | null;
}): GroupKey {
  return [row.market, row.region ?? '', row.assetClass ?? '', row.assetTier ?? ''].join('|');
}

function rollup<TRow extends {
  market: string;
  region: string | null;
  assetClass: AssetClass | null;
  assetTier: string | null;
  capRate: number;
  observedAt: Date | null;
}>(rows: TRow[]): CapRateBucket[] {
  const groups = new Map<GroupKey, TRow[]>();
  for (const row of rows) {
    const key = bucketKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: CapRateBucket[] = [];
  for (const list of groups.values()) {
    const sample = list[0]!;
    const values = list.map((r) => r.capRate);
    let latestObservedAt: Date | null = null;
    for (const r of list) {
      if (r.observedAt && (!latestObservedAt || r.observedAt > latestObservedAt)) {
        latestObservedAt = r.observedAt;
      }
    }
    out.push({
      market: sample.market,
      region: sample.region,
      assetClass: sample.assetClass,
      assetTier: sample.assetTier,
      count: list.length,
      minPct: Math.min(...values),
      medianPct: median(values),
      maxPct: Math.max(...values),
      latestObservedAt
    });
  }
  // Stable sort: market → region → assetClass → tier.
  out.sort(
    (a, b) =>
      a.market.localeCompare(b.market) ||
      (a.region ?? '').localeCompare(b.region ?? '') ||
      String(a.assetClass ?? '').localeCompare(String(b.assetClass ?? '')) ||
      (a.assetTier ?? '').localeCompare(b.assetTier ?? '')
  );
  return out;
}

export type CapRateAggregatorOptions = {
  market?: string;
  region?: string;
  assetClass?: AssetClass;
  /** Earliest observation date to include; defaults to last 24 months. */
  since?: Date;
};

export async function aggregateCapRates(
  options: CapRateAggregatorOptions = {},
  db: PrismaClient = defaultPrisma
): Promise<CapRateAggregation> {
  const since =
    options.since ??
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 24);
      return d;
    })();

  const [transactionRows, indicatorRows] = await Promise.all([
    db.transactionComp.findMany({
      where: {
        capRatePct: { not: null },
        market: options.market,
        region: options.region,
        assetClass: options.assetClass,
        OR: [{ transactionDate: null }, { transactionDate: { gte: since } }]
      },
      select: {
        market: true,
        region: true,
        assetClass: true,
        assetTier: true,
        capRatePct: true,
        transactionDate: true
      }
    }),
    db.marketIndicatorSeries.findMany({
      where: {
        indicatorKey: { contains: 'cap_rate' },
        value: { not: null },
        market: options.market,
        region: options.region,
        assetClass: options.assetClass,
        observationDate: { gte: since }
      },
      select: {
        market: true,
        region: true,
        assetClass: true,
        assetTier: true,
        value: true,
        observationDate: true
      }
    })
  ]);

  const txn = rollup(
    transactionRows
      .filter((r): r is typeof r & { capRatePct: number } => typeof r.capRatePct === 'number')
      .map((r) => ({
        market: r.market,
        region: r.region,
        assetClass: r.assetClass,
        assetTier: r.assetTier,
        capRate: r.capRatePct,
        observedAt: r.transactionDate
      }))
  );

  const indicators = rollup(
    indicatorRows
      .filter((r): r is typeof r & { value: number } => typeof r.value === 'number')
      .map((r) => ({
        market: r.market,
        region: r.region,
        assetClass: r.assetClass,
        assetTier: r.assetTier,
        capRate: r.value,
        observedAt: r.observationDate
      }))
  );

  const distinctMarkets = new Set([
    ...transactionRows.map((r) => r.market),
    ...indicatorRows.map((r) => r.market)
  ]).size;
  const distinctSubmarkets = new Set([
    ...transactionRows.map((r) => `${r.market}|${r.region ?? ''}`),
    ...indicatorRows.map((r) => `${r.market}|${r.region ?? ''}`)
  ]).size;

  return {
    fromTransactions: txn,
    fromIndicators: indicators,
    totals: {
      transactionRows: transactionRows.length,
      indicatorRows: indicatorRows.length,
      distinctMarkets,
      distinctSubmarkets
    }
  };
}

export const __testing = {
  median,
  rollup,
  bucketKey
};
