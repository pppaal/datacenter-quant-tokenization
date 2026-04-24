import { NextResponse } from 'next/server';
import { AssetClass } from '@prisma/client';
import { backfillDeltas, runQuarterlyAggregate } from '@/lib/services/quarterly-report/aggregator';
import { generateNarrative } from '@/lib/services/quarterly-report/narrative';

type Body = {
  quarter: string;
  market?: string;
  submarkets?: string[];
  assetClass?: AssetClass;
  generateNarratives?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.quarter || !/^\d{4}Q[1-4]$/.test(body.quarter)) {
    return NextResponse.json({ error: 'quarter required, format YYYYQn' }, { status: 400 });
  }

  try {
    const aggregate = await runQuarterlyAggregate({
      quarter: body.quarter,
      market: body.market ?? 'KR',
      submarkets: body.submarkets,
      assetClass: body.assetClass ?? null
    });

    const deltasUpdated = await backfillDeltas(body.quarter, body.market ?? 'KR');

    let narrativesGenerated = 0;
    if (body.generateNarratives) {
      await generateNarrative({ snapshotId: aggregate.nationalSnapshotId });
      narrativesGenerated++;
      for (const s of aggregate.submarkets) {
        try {
          await generateNarrative({ snapshotId: s.snapshotId });
          narrativesGenerated++;
        } catch (err) {
          console.warn(`narrative failed for ${s.submarket}: ${(err as Error).message}`);
        }
      }
    }

    return NextResponse.json({
      quarter: aggregate.quarter,
      market: aggregate.market,
      nationalSnapshotId: aggregate.nationalSnapshotId,
      submarkets: aggregate.submarkets.map((s) => ({
        submarket: s.submarket,
        snapshotId: s.snapshotId,
        hadMolitData: s.molit !== null,
        transactionCount: s.molit?.transactionCount ?? null,
        transactionVolumeKrw: s.molit?.transactionVolumeKrw ?? null
      })),
      macro: {
        baseRatePct: aggregate.ecos.baseRatePct,
        krwUsd: aggregate.ecos.krwUsd,
        cpiYoYPct: aggregate.ecos.cpiYoYPct,
        gdpYoYPct: aggregate.ecos.gdpYoYPct
      },
      dartSummary: {
        reitDisclosures: aggregate.dart.reitDisclosures.length,
        realEstateTransactions: aggregate.dart.realEstateTransactions.length
      },
      deltasUpdated,
      narrativesGenerated
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
