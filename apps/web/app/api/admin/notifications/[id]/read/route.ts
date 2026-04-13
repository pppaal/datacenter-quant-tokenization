import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { markNotificationRead } from '@/lib/services/notifications';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
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

  if (!actor || !hasRequiredAdminRole(actor.role, 'VIEWER')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const notification = await markNotificationRead(id);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.read',
      entityType: 'notification',
      entityId: notification.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        type: notification.type
      }
    });

    return NextResponse.json({
      ok: true,
      notification
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.read',
      entityType: 'notification',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to mark notification read'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark notification read' },
      { status: 400 }
    );
  }
}
