/**
 * DB adapter: load persisted `PropertyAnalysisSnapshot` predictions + realized
 * price observations from Prisma, then run the pure backtest in
 * `analysis-backtest.ts`.
 *
 * Realized prices for ad-hoc (PNU-keyed) analyses are sourced from
 * `RealizedOutcome` rows on managed assets whose parcel we can resolve via
 * `Asset.address.parcelId` (which stores the 19-digit PNU) — reusing the
 * existing realized-outcome capture rather than introducing a new table.
 * They are normalized into `RealizedPriceObservation` and fed point-in-time.
 */

import type { AssetClass, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  buildAnalysisBacktest,
  type AnalysisBacktestResult,
  type AnalysisPrediction,
  type RealizedPriceObservation
} from '@/lib/services/property-analyzer/analysis-backtest';

/** Extract the base-case exit cap rate from a stored FullReport JSON blob. */
export function extractPredictedExitCapRatePct(report: unknown): number | null {
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  const auto = r.autoAnalyze as Record<string, unknown> | undefined;
  const primary = auto?.primaryAnalysis as Record<string, unknown> | undefined;
  const scenarios = primary?.scenarios as
    | Array<{ name?: string; exitCapRatePct?: number | null }>
    | undefined;
  if (!Array.isArray(scenarios)) return null;
  const base = scenarios.find((s) => s.name === 'Base') ?? scenarios[0];
  const value = base?.exitCapRatePct;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type LoadBacktestOptions = {
  assetClass?: AssetClass;
  /** Cap the number of snapshots considered (newest-first). */
  limit?: number;
};

export async function runAnalysisBacktestFromDb(
  options: LoadBacktestOptions = {},
  db: PrismaClient = prisma
): Promise<AnalysisBacktestResult> {
  const snapshots = await db.propertyAnalysisSnapshot.findMany({
    where: options.assetClass ? { assetClass: options.assetClass } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(options.limit ?? 1000, 1), 5000),
    select: {
      id: true,
      pnu: true,
      assetClass: true,
      createdAt: true,
      baseCaseValueKrw: true,
      report: true
    }
  });

  const predictions: AnalysisPrediction[] = snapshots.map((row) => ({
    snapshotId: row.id,
    pnu: row.pnu,
    assetClass: row.assetClass,
    predictedAt: row.createdAt,
    predictedValueKrw: row.baseCaseValueKrw,
    predictedExitCapRatePct: extractPredictedExitCapRatePct(row.report)
  }));

  if (predictions.length === 0) {
    return buildAnalysisBacktest({ predictions, observations: [] });
  }

  const pnus = [...new Set(predictions.map((p) => p.pnu))];

  // 1. Realized outcomes on managed assets resolvable to one of these PNUs.
  const realizedOutcomes = await db.realizedOutcome.findMany({
    where: {
      valuationKrw: { not: null },
      asset: { address: { parcelId: { in: pnus } } }
    },
    select: {
      observationDate: true,
      valuationKrw: true,
      exitCapRatePct: true,
      asset: { select: { address: { select: { parcelId: true } } } }
    }
  });

  const observations: RealizedPriceObservation[] = [];
  for (const outcome of realizedOutcomes) {
    const pnu = outcome.asset?.address?.parcelId;
    if (!pnu || outcome.valuationKrw === null) continue;
    observations.push({
      pnu,
      observedAt: outcome.observationDate,
      realizedValueKrw: outcome.valuationKrw,
      realizedExitCapRatePct: outcome.exitCapRatePct
    });
  }

  return buildAnalysisBacktest({ predictions, observations });
}
