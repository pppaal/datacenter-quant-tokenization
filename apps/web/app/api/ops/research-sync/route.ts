import { NextResponse } from 'next/server';
import { ResearchSyncTriggerType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/services/audit';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';

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

  try {
    const summary = await runResearchWorkspaceSync({
      triggerType: ResearchSyncTriggerType.SCHEDULED,
      actorIdentifier: 'ops-cron'
    });

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'research.sync.scheduled',
      entityType: 'ResearchSyncRun',
      entityId: summary.id,
      requestPath: '/api/ops/research-sync',
      requestMethod: 'POST',
      statusLabel: summary.statusLabel,
      metadata: {
        triggerType: summary.triggerType,
        officialSourceCount: summary.officialSourceCount,
        assetDossierCount: summary.assetDossierCount,
        staleOfficialSourceCount: summary.staleOfficialSourceCount,
        staleAssetDossierCount: summary.staleAssetDossierCount
      }
    });

    return NextResponse.json(summary);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: 'research.sync.scheduled',
      entityType: 'ResearchSyncRun',
      requestPath: '/api/ops/research-sync',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to run research sync job'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run research sync job' },
      { status: 500 }
    );
  }
}
