/**
 * Persistence layer for click-to-analyze property analyses.
 *
 * The `/api/property-analyze` pipeline produces an in-memory `FullReport` and
 * historically persisted nothing (only an audit-log line). This module turns
 * each successful analysis into an immutable system-of-record row
 * (`PropertyAnalysisSnapshot`):
 *
 *   - frozen inputs hash (reuses `computeValuationInputsHash`, the same
 *     SHA-256 primitive used for `ValuationRun.inputsHash`)
 *   - resolved address / PNU / district / coords
 *   - primary asset class, headline base-case value, verdict tier
 *   - the full serialized `FullReport` JSON + engine/schema versions
 *
 * Rows are append-only: a re-analysis of the same parcel writes a NEW row.
 * Never updated. This preserves a point-in-time-honest history that the
 * realized-price backtest harness (`analysis-backtest.ts`) consumes.
 */

import type { AssetClass, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { computeValuationInputsHash } from '@/lib/services/valuation/inputs-hash';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';

/**
 * Serialization schema version for the persisted `report` blob. Bump when the
 * `FullReport` shape changes in a way the backtest / readers must distinguish.
 */
export const PROPERTY_ANALYSIS_SCHEMA_VERSION = 1;

/** Default engine version label when the strategy does not surface one. */
const DEFAULT_ENGINE_VERSION = 're-underwriting-ts-v1';

export type PersistedAnalysisSnapshot = {
  id: string;
  inputsHash: string;
  pnu: string;
  jibunAddress: string;
  roadAddress: string | null;
  districtName: string;
  latitude: number;
  longitude: number;
  assetClass: AssetClass;
  baseCaseValueKrw: number;
  verdictTier: string;
  engineVersion: string;
  schemaVersion: number;
  report: FullReport;
  createdAt: string;
};

/**
 * Derive the frozen inputs-hash for a report. We hash (engineVersion, the
 * primary analysis assumptions + resolved parcel) so two analyses that priced
 * the same parcel under the same engine + inputs collide — exactly the drift
 * signal `ValuationRun.inputsHash` provides for managed assets.
 */
export function computeAnalysisInputsHash(report: FullReport): string {
  const engineVersion = resolveEngineVersion(report);
  return computeValuationInputsHash({
    engineVersion,
    assumptions: {
      pnu: report.autoAnalyze.resolvedAddress.pnu,
      assetClass: report.autoAnalyze.primaryAnalysis.asset.assetClass,
      // The strategy's persisted assumption blob is the audit-of-record input.
      assumptions: report.autoAnalyze.primaryAnalysis.assumptions
    }
  });
}

function resolveEngineVersion(report: FullReport): string {
  const a = report.autoAnalyze.primaryAnalysis.assumptions as Record<string, unknown>;
  const candidate = a?.engineVersion;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : DEFAULT_ENGINE_VERSION;
}

/**
 * Persist ONE immutable snapshot for a successful full-report analysis.
 * Returns the new row id. Never updates an existing row.
 */
export async function persistAnalysisSnapshot(
  report: FullReport,
  db: PrismaClient = prisma
): Promise<{ id: string; inputsHash: string }> {
  const resolved = report.autoAnalyze.resolvedAddress;
  const primary = report.autoAnalyze.primaryAnalysis;
  const inputsHash = computeAnalysisInputsHash(report);

  const created = await db.propertyAnalysisSnapshot.create({
    data: {
      inputsHash,
      pnu: resolved.pnu,
      jibunAddress: resolved.jibunAddress,
      roadAddress: resolved.roadAddress,
      districtName: resolved.districtName,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      assetClass: primary.asset.assetClass as AssetClass,
      baseCaseValueKrw: primary.baseCaseValueKrw,
      verdictTier: report.verdict.tier,
      engineVersion: resolveEngineVersion(report),
      schemaVersion: PROPERTY_ANALYSIS_SCHEMA_VERSION,
      // Cast through Prisma.InputJsonValue: the FullReport is a deeply-nested
      // but JSON-safe structure (no Date/BigInt/Map at the top level — dates
      // are already ISO strings inside memo/rows).
      report: report as unknown as Prisma.InputJsonValue
    },
    select: { id: true, inputsHash: true }
  });

  return created;
}

function deserializeRow(row: {
  id: string;
  inputsHash: string;
  pnu: string;
  jibunAddress: string;
  roadAddress: string | null;
  districtName: string;
  latitude: number;
  longitude: number;
  assetClass: AssetClass;
  baseCaseValueKrw: number;
  verdictTier: string;
  engineVersion: string;
  schemaVersion: number;
  report: Prisma.JsonValue;
  createdAt: Date;
}): PersistedAnalysisSnapshot {
  return {
    id: row.id,
    inputsHash: row.inputsHash,
    pnu: row.pnu,
    jibunAddress: row.jibunAddress,
    roadAddress: row.roadAddress,
    districtName: row.districtName,
    latitude: row.latitude,
    longitude: row.longitude,
    assetClass: row.assetClass,
    baseCaseValueKrw: row.baseCaseValueKrw,
    verdictTier: row.verdictTier,
    engineVersion: row.engineVersion,
    schemaVersion: row.schemaVersion,
    report: row.report as unknown as FullReport,
    createdAt: row.createdAt.toISOString()
  };
}

/** Stable-URL retrieval of one snapshot by id. Returns null when missing. */
export async function getAnalysisSnapshotById(
  id: string,
  db: PrismaClient = prisma
): Promise<PersistedAnalysisSnapshot | null> {
  const row = await db.propertyAnalysisSnapshot.findUnique({ where: { id } });
  return row ? deserializeRow(row) : null;
}

export type AnalysisSnapshotListItem = Omit<PersistedAnalysisSnapshot, 'report'>;

/**
 * History list for a parcel (by PNU) or free-text address match, newest first.
 * Omits the heavy `report` blob — callers fetch the full row by id on demand.
 */
export async function listAnalysisSnapshots(
  filter: { pnu?: string; address?: string },
  options: { limit?: number } = {},
  db: PrismaClient = prisma
): Promise<AnalysisSnapshotListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const where: Prisma.PropertyAnalysisSnapshotWhereInput = {};
  if (filter.pnu) {
    where.pnu = filter.pnu;
  } else if (filter.address) {
    const term = filter.address.trim();
    where.OR = [
      { jibunAddress: { contains: term, mode: 'insensitive' } },
      { roadAddress: { contains: term, mode: 'insensitive' } }
    ];
  }

  const rows = await db.propertyAnalysisSnapshot.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      inputsHash: true,
      pnu: true,
      jibunAddress: true,
      roadAddress: true,
      districtName: true,
      latitude: true,
      longitude: true,
      assetClass: true,
      baseCaseValueKrw: true,
      verdictTier: true,
      engineVersion: true,
      schemaVersion: true,
      createdAt: true
    }
  });

  return rows.map((row) => ({
    id: row.id,
    inputsHash: row.inputsHash,
    pnu: row.pnu,
    jibunAddress: row.jibunAddress,
    roadAddress: row.roadAddress,
    districtName: row.districtName,
    latitude: row.latitude,
    longitude: row.longitude,
    assetClass: row.assetClass,
    baseCaseValueKrw: row.baseCaseValueKrw,
    verdictTier: row.verdictTier,
    engineVersion: row.engineVersion,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt.toISOString()
  }));
}
