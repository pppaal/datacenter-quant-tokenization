import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { replayOpsWorkItem } from '@/lib/services/ops-queue';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { genericErrorResponse } from '@/lib/security/error-response';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    // 401: no authenticated operator session.
    return NextResponse.json({ error: 'Active admin session required.' }, { status: 401 });
  }
  if (!hasRequiredAdminRole(actor.role, 'ADMIN')) {
    // 403: authenticated but lacks the ADMIN role required to requeue ops work
    // items. Defense-in-depth alongside the middleware role gate
    // (`getRequiredAdminRoleForPath` → ADMIN).
    return NextResponse.json(
      { error: 'Insufficient role. ADMIN access required.' },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  try {
    const workItem = await replayOpsWorkItem(
      {
        workItemId: id,
        actorIdentifier: actor.identifier
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops_work_item.requeue',
      entityType: 'OpsWorkItem',
      entityId: workItem.id,
      requestPath: `/api/admin/ops-work-items/${id}/replay`,
      requestMethod: 'POST',
      ipAddress,
      statusLabel: 'SUCCESS',
      metadata: {
        workType: workItem.workType,
        status: workItem.status,
        maxAttempts: workItem.maxAttempts
      }
    });

    return NextResponse.json({
      ok: true,
      workItem: {
        id: workItem.id,
        status: workItem.status
      }
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'ops_work_item.requeue_error',
      entityType: 'OpsWorkItem',
      entityId: id,
      requestPath: `/api/admin/ops-work-items/${id}/replay`,
      requestMethod: 'POST',
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to requeue ops work item.'
      }
    });

    return genericErrorResponse(error, {
      status: 500,
      context: { route: `/api/admin/ops-work-items/${id}/replay` }
    });
  }
}
