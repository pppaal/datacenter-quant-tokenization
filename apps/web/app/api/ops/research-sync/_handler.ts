import { NextResponse } from 'next/server';
import { ResearchSyncTriggerType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/services/audit';
import {
  runResearchWorkspaceSync,
  type ResearchSyncScope
} from '@/lib/services/research/workspace';

function isAuthorized(request: Request, expectedToken: string) {
  const bearer = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const headerToken = request.headers.get('x-ops-cron-token')?.trim();
  return bearer === expectedToken || headerToken === expectedToken;
}

/**
 * Shared handler for the scoped research-sync cron variants. Each route
 * file (full / macro / market / assets) provides the right scope and
 * audit path; everything else — auth, error reporting, audit shape —
 * lives here so the four endpoints stay byte-aligned.
 */
export async function runScopedResearchSyncRoute(
  request: Request,
  options: { scope: ResearchSyncScope; auditPath: string }
) {
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
      actorIdentifier: 'ops-cron',
      scope: options.scope
    });

    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: `research.sync.${options.scope}`,
      entityType: 'ResearchSyncRun',
      entityId: summary.id,
      requestPath: options.auditPath,
      requestMethod: 'POST',
      statusLabel: summary.statusLabel,
      metadata: {
        scope: options.scope,
        triggerType: summary.triggerType,
        officialSourceCount: summary.officialSourceCount,
        assetDossierCount: summary.assetDossierCount,
        staleOfficialSourceCount: summary.staleOfficialSourceCount,
        staleAssetDossierCount: summary.staleAssetDossierCount
      }
    });

    return NextResponse.json({ scope: options.scope, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run research sync job';
    await recordAuditEvent({
      actorIdentifier: 'ops-cron',
      actorRole: 'SYSTEM',
      action: `research.sync.${options.scope}`,
      entityType: 'ResearchSyncRun',
      requestPath: options.auditPath,
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: { scope: options.scope, error: message }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
