import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { replayOpsWorkItem } from '@/lib/services/ops-queue';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

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
    return NextResponse.json({ error: 'Active admin session required.' }, { status: 401 });
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

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to requeue ops work item.'
      },
      { status: 400 }
    );
  }
}
