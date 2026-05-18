import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { classifyAssetTier } from '@/lib/services/research/tier-classifier';

/**
 * Reclassify TransactionComp + MarketIndicatorSeries rows that have
 * no assetTier set yet (or that an operator has marked for re-run).
 *
 * Why an explicit ops route rather than a passive backfill cron:
 *   - The classifier rules will evolve. Each ruleset bump invalidates
 *     prior classifications and the operator needs an explicit knob
 *     to trigger the re-run after a deployment.
 *   - The classifier is a pure function (no outbound API calls). On
 *     a corpus past 100k rows the SQL fetch is the long pole, not
 *     the classification itself, so processing in one big sweep is
 *     fine even at scale.
 *
 * Trigger: POST /api/ops/reclassify-tiers
 *   ?force=true — re-classify rows that already have a tier set
 *   (default: skip them so manual overrides aren't clobbered).
 */

const BATCH_SIZE = 500;

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

export async function POST(request: Request) {
  const expectedToken = process.env.OPS_CRON_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json({ error: 'OPS_CRON_TOKEN is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const txnWhere = force ? {} : { assetTier: null };
    const transactionRows = await prisma.transactionComp.findMany({
      where: txnWhere,
      select: {
        id: true,
        comparableType: true,
        assetClass: true,
        assetId: true
      },
      take: BATCH_SIZE
    });

    // For TransactionComps tied to one of our assets, pull GFA + DC
    // redundancy from the buildingSnapshot for richer classification.
    const assetIds = Array.from(
      new Set(transactionRows.map((row) => row.assetId).filter((id): id is string => Boolean(id)))
    );
    const assetMeta = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: {
        id: true,
        grossFloorAreaSqm: true,
        buildingSnapshot: { select: { redundancyTier: true } }
      }
    });
    const metaById = new Map(assetMeta.map((a) => [a.id, a]));

    let txnReclassified = 0;
    for (const row of transactionRows) {
      const meta = row.assetId ? metaById.get(row.assetId) : null;
      const tier = classifyAssetTier({
        comparableType: row.comparableType,
        assetClass: row.assetClass,
        grossFloorAreaSqm: meta?.grossFloorAreaSqm ?? null,
        redundancyTier: meta?.buildingSnapshot?.redundancyTier ?? null
      });
      if (!tier) continue;
      await prisma.transactionComp.update({
        where: { id: row.id },
        data: { assetTier: tier }
      });
      txnReclassified += 1;
    }

    const indicatorWhere = force ? {} : { assetTier: null };
    const indicatorRows = await prisma.marketIndicatorSeries.findMany({
      where: indicatorWhere,
      select: { id: true, indicatorKey: true, assetClass: true },
      take: BATCH_SIZE
    });

    let indicatorReclassified = 0;
    for (const row of indicatorRows) {
      // MarketIndicatorSeries rows don't have a free-text "comparableType"
      // — they have indicatorKey ("office.cap_rate_pct"). The classifier
      // can still pick up tier hints if the key is namespaced
      // ("office.prime.cap_rate_pct"); otherwise these stay untiered.
      const tier = classifyAssetTier({
        comparableType: row.indicatorKey,
        assetClass: row.assetClass
      });
      if (!tier) continue;
      await prisma.marketIndicatorSeries.update({
        where: { id: row.id },
        data: { assetTier: tier }
      });
      indicatorReclassified += 1;
    }

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'tier-classifier.backfill',
      entityType: 'TransactionComp',
      requestPath: '/api/ops/reclassify-tiers',
      requestMethod: 'POST',
      statusLabel: 'OK',
      metadata: {
        force,
        transactionRowsScanned: transactionRows.length,
        transactionRowsReclassified: txnReclassified,
        indicatorRowsScanned: indicatorRows.length,
        indicatorRowsReclassified: indicatorReclassified
      }
    });

    return NextResponse.json({
      ok: true,
      force,
      transactionRowsScanned: transactionRows.length,
      transactionRowsReclassified: txnReclassified,
      indicatorRowsScanned: indicatorRows.length,
      indicatorRowsReclassified: indicatorReclassified
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tier reclassification failed';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'tier-classifier.backfill',
      entityType: 'TransactionComp',
      requestPath: '/api/ops/reclassify-tiers',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
