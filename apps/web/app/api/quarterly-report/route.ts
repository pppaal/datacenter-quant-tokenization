import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const quarter = url.searchParams.get('quarter');
  const market = url.searchParams.get('market') ?? 'KR';
  const submarket = url.searchParams.get('submarket') ?? '전국';

  if (!quarter) {
    return NextResponse.json({ error: 'quarter is required (e.g. 2026Q1)' }, { status: 400 });
  }

  const snap = await prisma.quarterlyMarketSnapshot.findFirst({
    where: { market, submarket, quarter },
    include: {
      narratives: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!snap) {
    return NextResponse.json({ error: `No snapshot for ${market}/${submarket}/${quarter}` }, { status: 404 });
  }

  const narrative = snap.narratives[0] ?? null;

  return NextResponse.json({
    snapshot: {
      id: snap.id,
      market: snap.market,
      submarket: snap.submarket,
      assetClass: snap.assetClass,
      quarter: snap.quarter,
      quarterEndDate: snap.quarterEndDate,
      transactionCount: snap.transactionCount,
      transactionVolumeKrw: snap.transactionVolumeKrw?.toString() ?? null,
      medianPriceKrwPerSqm: snap.medianPriceKrwPerSqm?.toString() ?? null,
      priceChangeQoQPct: snap.priceChangeQoQPct?.toString() ?? null,
      priceChangeYoYPct: snap.priceChangeYoYPct?.toString() ?? null,
      baseRatePct: snap.baseRatePct?.toString() ?? null,
      krwUsd: snap.krwUsd?.toString() ?? null,
      cpiYoYPct: snap.cpiYoYPct?.toString() ?? null,
      gdpYoYPct: snap.gdpYoYPct?.toString() ?? null,
      rawMetrics: snap.rawMetrics,
      sourceManifest: snap.sourceManifest,
      generatedAt: snap.generatedAt
    },
    narrative: narrative
      ? {
          id: narrative.id,
          status: narrative.status,
          model: narrative.model,
          headline: narrative.headline,
          marketPulse: narrative.marketPulse,
          supplyPipeline: narrative.supplyPipeline,
          capitalMarkets: narrative.capitalMarkets,
          outlook: narrative.outlook,
          overweightList: narrative.overweightList,
          underweightList: narrative.underweightList,
          risks: narrative.risks,
          createdAt: narrative.createdAt
        }
      : null
  });
}
