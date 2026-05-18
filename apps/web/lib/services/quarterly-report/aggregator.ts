/**
 * Quarterly aggregation orchestrator.
 *   1. pull ECOS macro
 *   2. pull MOLIT transaction aggregate per submarket
 *   3. pull DART disclosure slice (nationwide)
 *   4. persist QuarterlyMarketSnapshot rows (one per submarket + macro-only row)
 */

import type { AssetClass, QuarterlyMarketSnapshot } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { fetchEcosSnapshot, type EcosMacroSnapshot } from './connectors/ecos';
import {
  aggregateQuarter as aggregateMolit,
  LAWD_CODES,
  type MolitTransactionAggregate
} from './connectors/molit-transactions';
import { fetchDartQuarter, type DartQuarterSlice } from './connectors/dart';

export type QuarterlyAggregateResult = {
  quarter: string;
  market: string;
  ecos: EcosMacroSnapshot;
  dart: DartQuarterSlice;
  submarkets: Array<{
    submarket: string;
    molit: MolitTransactionAggregate | null;
    snapshotId: string;
  }>;
  nationalSnapshotId: string;
};

export type QuarterlyAggregateInput = {
  quarter: string;
  market?: string;
  submarkets?: string[];
  assetClass?: AssetClass | null;
};

function quarterEndDate(quarter: string): Date {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) throw new Error(`Invalid quarter "${quarter}"`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  const endMonth = q * 3;
  const endDay = new Date(year, endMonth, 0).getDate();
  return new Date(Date.UTC(year, endMonth - 1, endDay));
}

export async function runQuarterlyAggregate(
  input: QuarterlyAggregateInput
): Promise<QuarterlyAggregateResult> {
  const market = input.market ?? 'KR';
  const submarkets = input.submarkets ?? Object.keys(LAWD_CODES);
  const endDate = quarterEndDate(input.quarter);

  const [ecos, dart] = await Promise.all([fetchEcosSnapshot(), fetchDartQuarter(input.quarter)]);

  // National (submarket = "전국") row carries macro + DART summary
  const nationalRaw = {
    ecos,
    dart: {
      reitDisclosureCount: dart.reitDisclosures.length,
      realEstateTransactionCount: dart.realEstateTransactions.length,
      totalFetched: dart.totalFetched,
      topReitDisclosures: dart.reitDisclosures.slice(0, 20).map((d) => ({
        corpName: d.corp_name,
        reportName: d.report_nm,
        receiptNo: d.rcept_no,
        receiptDate: d.rcept_dt
      })),
      topRealEstateTransactions: dart.realEstateTransactions.slice(0, 20).map((d) => ({
        corpName: d.corp_name,
        reportName: d.report_nm,
        receiptNo: d.rcept_no,
        receiptDate: d.rcept_dt
      }))
    }
  };

  const nationalSnapshot = await upsertSnapshot({
    market,
    submarket: '전국',
    assetClass: input.assetClass ?? null,
    quarter: input.quarter,
    quarterEndDate: endDate,
    ecos,
    molit: null,
    rawMetrics: nationalRaw,
    sourceManifest: {
      ecos: ecos.sourceManifest,
      dart: dart.sourceManifest
    }
  });

  // Per-submarket rows carry the MOLIT aggregate + echo macro for convenience
  const submarketResults: QuarterlyAggregateResult['submarkets'] = [];
  for (const sm of submarkets) {
    let molit: MolitTransactionAggregate | null = null;
    try {
      molit = await aggregateMolit(sm, input.quarter);
    } catch (err) {
      molit = null;
      // continue — partial data is fine
      console.warn(`[quarterly] MOLIT aggregate failed for ${sm}: ${(err as Error).message}`);
    }

    const snap = await upsertSnapshot({
      market,
      submarket: sm,
      assetClass: input.assetClass ?? null,
      quarter: input.quarter,
      quarterEndDate: endDate,
      ecos,
      molit,
      rawMetrics: { ecos, molit },
      sourceManifest: {
        ecos: ecos.sourceManifest,
        molit: molit
          ? { endpoint: molit.sourceUrl, fetchedAt: molit.fetchedAt, rows: molit.transactionCount }
          : {
              endpoint: 'MOLIT (no data / key missing)',
              fetchedAt: new Date().toISOString(),
              rows: 0
            }
      }
    });
    submarketResults.push({ submarket: sm, molit, snapshotId: snap.id });
  }

  return {
    quarter: input.quarter,
    market,
    ecos,
    dart,
    submarkets: submarketResults,
    nationalSnapshotId: nationalSnapshot.id
  };
}

async function upsertSnapshot(args: {
  market: string;
  submarket: string;
  assetClass: AssetClass | null;
  quarter: string;
  quarterEndDate: Date;
  ecos: EcosMacroSnapshot;
  molit: MolitTransactionAggregate | null;
  rawMetrics: unknown;
  sourceManifest: unknown;
}): Promise<QuarterlyMarketSnapshot> {
  const data = {
    market: args.market,
    submarket: args.submarket,
    assetClass: args.assetClass,
    quarter: args.quarter,
    quarterEndDate: args.quarterEndDate,
    transactionCount: args.molit?.transactionCount ?? null,
    transactionVolumeKrw: args.molit ? BigInt(Math.round(args.molit.transactionVolumeKrw)) : null,
    medianPriceKrwPerSqm: args.molit?.medianPriceKrwPerSqm ?? null,
    priceChangeQoQPct: null,
    priceChangeYoYPct: null,
    vacancyPct: null,
    rentKrwPerSqm: null,
    capRatePct: null,
    newConstructionApprovalsCount: null,
    newConstructionApprovalsGfaSqm: null,
    baseRatePct: args.ecos.baseRatePct,
    krwUsd: args.ecos.krwUsd,
    cpiYoYPct: args.ecos.cpiYoYPct,
    gdpYoYPct: args.ecos.gdpYoYPct,
    rawMetrics: args.rawMetrics as never,
    sourceManifest: args.sourceManifest as never
  };

  const existing = await prisma.quarterlyMarketSnapshot.findUnique({
    where: {
      market_submarket_assetClass_quarter: {
        market: args.market,
        submarket: args.submarket,
        assetClass: args.assetClass as never,
        quarter: args.quarter
      }
    }
  });

  if (existing) {
    return prisma.quarterlyMarketSnapshot.update({
      where: { id: existing.id },
      data
    });
  }
  return prisma.quarterlyMarketSnapshot.create({ data });
}

/**
 * Compute QoQ and YoY price deltas for a freshly-written quarter by looking up
 * the prior snapshots for the same submarket. Run this AFTER runQuarterlyAggregate.
 */
export async function backfillDeltas(quarter: string, market = 'KR'): Promise<number> {
  const rows = await prisma.quarterlyMarketSnapshot.findMany({
    where: { market, quarter }
  });
  let updated = 0;
  for (const row of rows) {
    if (row.medianPriceKrwPerSqm === null) continue;
    const priorQoQ = await findPrior(row.market, row.submarket, row.assetClass, quarter, 1);
    const priorYoY = await findPrior(row.market, row.submarket, row.assetClass, quarter, 4);
    const qoqPct = computePct(row.medianPriceKrwPerSqm as unknown as number, priorQoQ);
    const yoyPct = computePct(row.medianPriceKrwPerSqm as unknown as number, priorYoY);
    await prisma.quarterlyMarketSnapshot.update({
      where: { id: row.id },
      data: {
        priceChangeQoQPct: qoqPct as never,
        priceChangeYoYPct: yoyPct as never
      }
    });
    updated++;
  }
  return updated;
}

async function findPrior(
  market: string,
  submarket: string,
  assetClass: AssetClass | null,
  quarter: string,
  quartersBack: number
): Promise<number | null> {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const totalQ = year * 4 + (q - 1) - quartersBack;
  const priorYear = Math.floor(totalQ / 4);
  const priorQ = (totalQ % 4) + 1;
  const priorKey = `${priorYear}Q${priorQ}`;

  const row = await prisma.quarterlyMarketSnapshot.findUnique({
    where: {
      market_submarket_assetClass_quarter: {
        market,
        submarket,
        assetClass: assetClass as never,
        quarter: priorKey
      }
    }
  });
  if (!row || row.medianPriceKrwPerSqm === null) return null;
  return Number(row.medianPriceKrwPerSqm);
}

function computePct(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}
