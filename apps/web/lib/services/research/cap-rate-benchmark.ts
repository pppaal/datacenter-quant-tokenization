/**
 * Comp → underwriting cap-rate BENCHMARK bridge (benchmark #8).
 *
 * `aggregateCapRates` already turns TransactionComp + MarketIndicatorSeries rows into
 * CBRE-style (market × region × class × tier) cap-rate buckets — but that output only
 * feeds the research dashboards. Nothing reads it back toward underwriting. This closes
 * that loop: given a target asset (market / class / tier), pick the most specific bucket
 * match, blend the deal-level (ground-truth) and published (denser) sources, and return a
 * single benchmark cap rate + a confidence grade + freshness — ready to inject into a
 * stabilized-income assumption fallback or to display alongside the model's own cap rate
 * in an IC memo.
 *
 * `selectCapRateBenchmark` is PURE (operates on already-fetched buckets) so it is fully
 * unit-testable; `deriveAssetCapRateBenchmark` is the thin DB wrapper.
 *
 * The blended figure is a COUNT-WEIGHTED mean of bucket medians (an approximation when a
 * relaxed match spans several buckets) — documented so it is not mistaken for a true
 * pooled median.
 */
import type { AssetClass, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { aggregateCapRates, type CapRateBucket } from '@/lib/services/research/cap-rate-aggregator';
import { round } from '@/lib/math';

export type CapRateBenchmarkConfidence = 'high' | 'medium' | 'low' | 'none';
export type CapRateBenchmarkMatch = 'market-class-tier' | 'market-class' | 'market' | 'none';
export type CapRateBenchmarkSource = 'transactions' | 'indicators' | 'blended' | 'none';

export type CapRateBenchmarkTarget = {
  market: string;
  region?: string | null;
  assetClass?: AssetClass | null;
  assetTier?: string | null;
};

export type CapRateBenchmark = {
  medianPct: number | null;
  minPct: number | null;
  maxPct: number | null;
  /** Total observations behind the chosen match (summed across blended buckets). */
  sampleCount: number;
  confidence: CapRateBenchmarkConfidence;
  matchLevel: CapRateBenchmarkMatch;
  source: CapRateBenchmarkSource;
  /** Months since the latest observation in the matched buckets (null if undated / no asOf). */
  staleMonths: number | null;
  notes: string[];
};

const STALE_MONTHS_LIMIT = 18;
const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000;

type TaggedBucket = { bucket: CapRateBucket; source: 'transactions' | 'indicators' };

function matchesLevel(
  bucket: CapRateBucket,
  target: CapRateBenchmarkTarget,
  level: Exclude<CapRateBenchmarkMatch, 'none'>
): boolean {
  if (bucket.market !== target.market) return false;
  // Region, when the target specifies one, must always agree (a different submarket is a
  // different benchmark). Targets without a region match any region.
  if (target.region != null && bucket.region !== target.region) return false;
  if (level === 'market') return true;
  if (target.assetClass == null || bucket.assetClass !== target.assetClass) return false;
  if (level === 'market-class') return true;
  // market-class-tier
  return target.assetTier != null && bucket.assetTier === target.assetTier;
}

function combine(matches: TaggedBucket[], target: CapRateBenchmarkTarget, asOf?: Date) {
  const sampleCount = matches.reduce((s, m) => s + m.bucket.count, 0);
  const weightedMedian =
    sampleCount > 0
      ? matches.reduce((s, m) => s + m.bucket.medianPct * m.bucket.count, 0) / sampleCount
      : null;
  const minPct = Math.min(...matches.map((m) => m.bucket.minPct));
  const maxPct = Math.max(...matches.map((m) => m.bucket.maxPct));

  let latest: Date | null = null;
  for (const m of matches) {
    const d = m.bucket.latestObservedAt;
    if (d && (!latest || d > latest)) latest = d;
  }
  const staleMonths =
    asOf && latest
      ? Math.max(0, Math.round((asOf.getTime() - latest.getTime()) / MS_PER_MONTH))
      : null;

  const hasTxn = matches.some((m) => m.source === 'transactions');
  const hasInd = matches.some((m) => m.source === 'indicators');
  const source: CapRateBenchmarkSource =
    hasTxn && hasInd ? 'blended' : hasTxn ? 'transactions' : 'indicators';

  const fresh = staleMonths == null || staleMonths <= STALE_MONTHS_LIMIT;
  let confidence: CapRateBenchmarkConfidence;
  if (hasTxn && sampleCount >= 5 && fresh) confidence = 'high';
  else if (sampleCount >= 3 && fresh) confidence = 'medium';
  else confidence = 'low';

  const notes: string[] = [];
  notes.push(
    `${sampleCount} observation(s) across ${matches.length} bucket(s) (${source}); count-weighted median of bucket medians.`
  );
  if (staleMonths != null && staleMonths > STALE_MONTHS_LIMIT) {
    notes.push(
      `Latest comp is ${staleMonths} months old (> ${STALE_MONTHS_LIMIT}m): treat as stale.`
    );
  }
  if (!hasTxn) {
    notes.push('No deal-level (transaction) comps in this match — published indicators only.');
  }

  return {
    medianPct: weightedMedian == null ? null : round(weightedMedian, 2),
    minPct: Number.isFinite(minPct) ? round(minPct, 2) : null,
    maxPct: Number.isFinite(maxPct) ? round(maxPct, 2) : null,
    sampleCount,
    confidence,
    source,
    staleMonths,
    notes
  };
}

export function selectCapRateBenchmark(params: {
  fromTransactions: CapRateBucket[];
  fromIndicators: CapRateBucket[];
  target: CapRateBenchmarkTarget;
  asOf?: Date;
}): CapRateBenchmark {
  const tagged: TaggedBucket[] = [
    ...params.fromTransactions.map((bucket) => ({ bucket, source: 'transactions' as const })),
    ...params.fromIndicators.map((bucket) => ({ bucket, source: 'indicators' as const }))
  ];

  // Try the most specific match first, relaxing tier → class → market.
  const levels: Exclude<CapRateBenchmarkMatch, 'none'>[] = [];
  if (params.target.assetClass != null && params.target.assetTier != null) {
    levels.push('market-class-tier');
  }
  if (params.target.assetClass != null) levels.push('market-class');
  levels.push('market');

  for (const level of levels) {
    const matches = tagged.filter((t) => matchesLevel(t.bucket, params.target, level));
    if (matches.length > 0) {
      const combined = combine(matches, params.target, params.asOf);
      return { ...combined, matchLevel: level };
    }
  }

  return {
    medianPct: null,
    minPct: null,
    maxPct: null,
    sampleCount: 0,
    confidence: 'none',
    matchLevel: 'none',
    source: 'none',
    staleMonths: null,
    notes: [`No cap-rate comps found for market "${params.target.market}".`]
  };
}

export async function deriveAssetCapRateBenchmark(
  target: CapRateBenchmarkTarget,
  db: PrismaClient = defaultPrisma,
  asOf: Date = new Date()
): Promise<CapRateBenchmark> {
  // Query by market only; relax class/tier inside the pure selector so a thin asset-tier
  // bucket can fall back to the broader market benchmark.
  const aggregation = await aggregateCapRates({ market: target.market }, db);
  return selectCapRateBenchmark({
    fromTransactions: aggregation.fromTransactions,
    fromIndicators: aggregation.fromIndicators,
    target,
    asOf
  });
}
