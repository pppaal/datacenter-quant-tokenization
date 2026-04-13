import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { markAllNotificationsRead } from '@/lib/services/notifications';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'VIEWER')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  try {
    const count = await markAllNotificationsRead();

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.read_all',
      entityType: 'notification',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        updated: count
      }
    });

    return NextResponse.json({
      ok: true,
      updated: count
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.read_all',
      entityType: 'notification',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to mark all notifications read'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark all notifications read' },
      { status: 400 }
    );
  }
}
