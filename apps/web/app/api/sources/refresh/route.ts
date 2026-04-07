import { NextResponse } from 'next/server';
import { SourceRefreshTriggerType } from '@prisma/client';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { runSourceRefreshJob } from '@/lib/services/source-refresh';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Analyst access required.' }, { status: 403 });
  }

  try {
    const summary = await runSourceRefreshJob({
      triggerType: SourceRefreshTriggerType.MANUAL,
      actorIdentifier: actor.identifier
    });

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'sources.refresh.manual',
      entityType: 'SourceRefreshRun',
      entityId: summary.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
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
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'sources.refresh.manual',
      entityType: 'SourceRefreshRun',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to refresh sources'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh sources' },
      { status: 500 }
    );
  }
}
