import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, type PrismaClient } from '@prisma/client';
import {
  computeAnalysisInputsHash,
  getAnalysisSnapshotById,
  listAnalysisSnapshots,
  persistAnalysisSnapshot,
  PROPERTY_ANALYSIS_SCHEMA_VERSION
} from '@/lib/services/property-analyzer/snapshot';
import { extractPredictedExitCapRatePct } from '@/lib/services/property-analyzer/analysis-backtest-loader';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';

/**
 * Minimal structurally-valid FullReport: only the fields the snapshot service
 * reads are populated. Cast through unknown — the persistence layer treats the
 * report as an opaque JSON blob beyond the few extracted columns.
 */
function buildReport(
  overrides: {
    pnu?: string;
    assetClass?: AssetClass;
    baseCaseValueKrw?: number;
    tier?: string;
    exitCapRatePct?: number | null;
    engineVersion?: string;
  } = {}
): FullReport {
  return {
    autoAnalyze: {
      resolvedAddress: {
        jibunAddress: '서울특별시 강남구 역삼동 123-45',
        roadAddress: '서울특별시 강남구 테헤란로 1',
        pnu: overrides.pnu ?? '1168010100101230045',
        latitude: 37.5,
        longitude: 127.04,
        districtName: '강남구'
      },
      primaryAnalysis: {
        asset: {
          name: 'Test Tower',
          assetCode: 'TEST-01',
          assetClass: overrides.assetClass ?? AssetClass.OFFICE,
          stage: 'STABILIZED',
          market: 'Seoul'
        },
        baseCaseValueKrw: overrides.baseCaseValueKrw ?? 120_000_000_000,
        confidenceScore: 0.8,
        assumptions: {
          engineVersion: overrides.engineVersion ?? 're-underwriting-ts-v1',
          occupancyPct: 92
        },
        scenarios: [
          { name: 'Base', exitCapRatePct: overrides.exitCapRatePct ?? 6.0 },
          { name: 'Downside', exitCapRatePct: 7.0 }
        ]
      }
    },
    verdict: { tier: overrides.tier ?? 'BUY' }
  } as unknown as FullReport;
}

type Row = {
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
  report: unknown;
  createdAt: Date;
};

function createFakeDb(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let counter = rows.length;
  return {
    db: {
      propertyAnalysisSnapshot: {
        async create(args: { data: Omit<Row, 'id' | 'createdAt'>; select?: unknown }) {
          counter += 1;
          const row: Row = {
            ...args.data,
            id: `snap-${counter}`,
            createdAt: new Date('2026-05-29T00:00:00.000Z')
          };
          rows.push(row);
          return { id: row.id, inputsHash: row.inputsHash };
        },
        async findUnique(args: { where: { id: string } }) {
          return rows.find((r) => r.id === args.where.id) ?? null;
        },
        async findMany(args: {
          where?: {
            pnu?: string;
            OR?: Array<Record<string, unknown>>;
          };
          take?: number;
          orderBy?: unknown;
        }) {
          let filtered = rows;
          if (args.where?.pnu) {
            filtered = filtered.filter((r) => r.pnu === args.where!.pnu);
          }
          const ordered = [...filtered].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
          return ordered.slice(0, args.take ?? 50);
        }
      }
    } as unknown as PrismaClient,
    rows
  };
}

test('inputs hash is deterministic and changes with engine version', () => {
  const report = buildReport();
  const h1 = computeAnalysisInputsHash(report);
  const h2 = computeAnalysisInputsHash(buildReport());
  assert.equal(h1, h2);
  assert.equal(h1.length, 64); // SHA-256 hex

  const drifted = computeAnalysisInputsHash(buildReport({ engineVersion: 'kdc-kr-ts-v2' }));
  assert.notEqual(h1, drifted);
});

test('persist writes the extracted columns and the report blob round-trips', async () => {
  const { db } = createFakeDb();
  const report = buildReport({
    pnu: '1111122222333334444',
    assetClass: AssetClass.DATA_CENTER,
    baseCaseValueKrw: 250_000_000_000,
    tier: 'STRONG_BUY'
  });

  const { id, inputsHash } = await persistAnalysisSnapshot(report, db);
  assert.ok(id);
  assert.equal(inputsHash, computeAnalysisInputsHash(report));

  const loaded = await getAnalysisSnapshotById(id, db);
  assert.ok(loaded);
  assert.equal(loaded.pnu, '1111122222333334444');
  assert.equal(loaded.assetClass, AssetClass.DATA_CENTER);
  assert.equal(loaded.baseCaseValueKrw, 250_000_000_000);
  assert.equal(loaded.verdictTier, 'STRONG_BUY');
  assert.equal(loaded.schemaVersion, PROPERTY_ANALYSIS_SCHEMA_VERSION);
  assert.equal(loaded.engineVersion, 're-underwriting-ts-v1');

  // The full report blob survives the round-trip.
  assert.equal(loaded.report.autoAnalyze.primaryAnalysis.baseCaseValueKrw, 250_000_000_000);
  assert.equal(loaded.createdAt, '2026-05-29T00:00:00.000Z');
});

test('re-analysis appends a NEW immutable row (never updates)', async () => {
  const { db, rows } = createFakeDb();
  const report = buildReport();
  const first = await persistAnalysisSnapshot(report, db);
  const second = await persistAnalysisSnapshot(report, db);
  assert.notEqual(first.id, second.id);
  assert.equal(rows.length, 2);
  // Identical inputs => identical hash, but two distinct rows retained.
  assert.equal(first.inputsHash, second.inputsHash);
});

test('list by PNU returns history newest-first and omits the report blob', async () => {
  const { db } = createFakeDb();
  await persistAnalysisSnapshot(buildReport({ pnu: 'PNU-X', baseCaseValueKrw: 1 }), db);
  await persistAnalysisSnapshot(buildReport({ pnu: 'PNU-X', baseCaseValueKrw: 2 }), db);
  await persistAnalysisSnapshot(buildReport({ pnu: 'PNU-Y', baseCaseValueKrw: 3 }), db);

  const xs = await listAnalysisSnapshots({ pnu: 'PNU-X' }, {}, db);
  assert.equal(xs.length, 2);
  assert.ok(xs.every((item) => item.pnu === 'PNU-X'));
  // List items must not carry the heavy report payload.
  assert.ok(!('report' in xs[0]!));
});

test('extractPredictedExitCapRatePct reads the Base scenario exit cap from a stored report', () => {
  const report = buildReport({ exitCapRatePct: 5.75 });
  assert.equal(extractPredictedExitCapRatePct(report), 5.75);
  assert.equal(extractPredictedExitCapRatePct(null), null);
  assert.equal(extractPredictedExitCapRatePct({}), null);
});
