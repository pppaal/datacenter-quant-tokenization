import { NextResponse } from 'next/server';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { runOpsCycle } from '@/lib/services/ops-worker';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor || !hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Analyst access required.' }, { status: 403 });
  }

  try {
    const summary = await runOpsCycle({
      actorIdentifier: actor.identifier,
      scheduled: false
    });

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops.cycle.manual',
      entityType: 'OpsCycle',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'SUCCESS',
      metadata: {
        sourceRunId: summary.sourceRun.id,
        researchRunId: summary.researchRun.id,
        sourceStatus: summary.sourceRun.statusLabel,
        researchStatus: summary.researchRun.statusLabel
      }
    });

    return NextResponse.json(summary);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops.cycle.manual',
      entityType: 'OpsCycle',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to run ops cycle'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run ops cycle' },
      { status: 500 }
    );
  }
}
