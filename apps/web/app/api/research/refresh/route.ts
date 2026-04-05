import { NextResponse } from 'next/server';
import { ResearchSyncTriggerType } from '@prisma/client';
import { getAdminActorFromHeaders, getRequestIpAddress } from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';
import { runResearchWorkspaceSync } from '@/lib/services/research/workspace';

export async function POST(request: Request) {
  const actor = getAdminActorFromHeaders(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Analyst access required.' }, { status: 403 });
  }

  try {
    const summary = await runResearchWorkspaceSync({
      triggerType: ResearchSyncTriggerType.WORKSPACE_REFRESH,
      actorIdentifier: actor.identifier
    });

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.sync.workspace',
      entityType: 'ResearchSyncRun',
      entityId: summary.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
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
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.sync.workspace',
      entityType: 'ResearchSyncRun',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to refresh research workspace'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh research workspace' },
      { status: 500 }
    );
  }
}
