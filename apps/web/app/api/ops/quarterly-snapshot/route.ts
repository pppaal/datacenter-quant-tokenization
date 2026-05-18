import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/services/audit';
import { backfillDeltas, runQuarterlyAggregate } from '@/lib/services/quarterly-report/aggregator';
import { generateNarrative } from '@/lib/services/quarterly-report/narrative';
import { LAWD_CODES } from '@/lib/services/quarterly-report/connectors/molit-transactions';

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

function previousQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  const total = d.getFullYear() * 4 + (q - 1) - 1;
  return `${Math.floor(total / 4)}Q${(total % 4) + 1}`;
}

type Body = {
  quarter?: string;
  market?: string;
  submarkets?: string[];
  generateNarratives?: boolean;
};

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  let body: Body = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw) as Body;
  } catch {
    // ignore — use defaults
  }

  const quarter = body.quarter ?? previousQuarter();
  const market = body.market ?? 'KR';
  const submarkets = body.submarkets ?? Object.keys(LAWD_CODES);
  const withNarratives = body.generateNarratives ?? true;

  try {
    const aggregate = await runQuarterlyAggregate({ quarter, market, submarkets });
    const deltasUpdated = await backfillDeltas(quarter, market);

    let narrativesGenerated = 0;
    if (withNarratives) {
      await generateNarrative({ snapshotId: aggregate.nationalSnapshotId });
      narrativesGenerated++;
      for (const s of aggregate.submarkets) {
        try {
          await generateNarrative({ snapshotId: s.snapshotId });
          narrativesGenerated++;
        } catch (err) {
          console.warn(`[cron] narrative failed for ${s.submarket}: ${(err as Error).message}`);
        }
      }
    }

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'quarterly_snapshot.run',
      entityType: 'quarterly_market_snapshot',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      metadata: {
        quarter,
        market,
        submarketCount: aggregate.submarkets.length,
        submarketsWithData: aggregate.submarkets.filter((s) => s.molit !== null).length,
        narrativesGenerated,
        deltasUpdated
      }
    });

    return NextResponse.json({
      quarter,
      market,
      submarkets: aggregate.submarkets.map((s) => ({
        submarket: s.submarket,
        snapshotId: s.snapshotId,
        hadMolitData: s.molit !== null
      })),
      macro: {
        baseRatePct: aggregate.ecos.baseRatePct,
        krwUsd: aggregate.ecos.krwUsd,
        cpiYoYPct: aggregate.ecos.cpiYoYPct,
        gdpYoYPct: aggregate.ecos.gdpYoYPct
      },
      narrativesGenerated,
      deltasUpdated
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'quarterly_snapshot.run',
      entityType: 'quarterly_market_snapshot',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      statusLabel: 'FAILED',
      metadata: { quarter, market, error: error instanceof Error ? error.message : 'unknown' }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Quarterly snapshot failed' },
      { status: 500 }
    );
  }
}
