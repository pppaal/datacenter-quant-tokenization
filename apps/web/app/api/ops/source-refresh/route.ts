import { NextResponse } from 'next/server';
import { SourceRefreshTriggerType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/services/audit';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
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

  try {
    const summary = await runSourceRefreshJob({
      triggerType: SourceRefreshTriggerType.SCHEDULED,
      actorIdentifier: 'ops-cron'
    });

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'sources.refresh.scheduled',
      entityType: 'SourceRefreshRun',
      entityId: summary.id,
      requestPath: '/api/ops/source-refresh',
      requestMethod: 'POST',
      statusLabel: summary.statusLabel,
      metadata: {
        triggerType: summary.triggerType,
        sourceSystemCount: summary.sourceSystemCount,
        staleSourceSystemCount: summary.staleSourceSystemCount,
        assetCandidateCount: summary.assetCandidateCount,
        refreshedAssetCount: summary.refreshedAssetCount,
        failedAssetCount: summary.failedAssetCount
      }
    });

    return NextResponse.json(summary);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'sources.refresh.scheduled',
      entityType: 'SourceRefreshRun',
      requestPath: '/api/ops/source-refresh',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to run source refresh job'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run source refresh job' },
      { status: 500 }
    );
  }
}
