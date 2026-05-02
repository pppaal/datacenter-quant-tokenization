import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordAuditEvent } from '@/lib/services/audit';
import { listRecentNotifications } from '@/lib/services/notifications';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'VIEWER')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  try {
    const notifications = await listRecentNotifications(limit);
    const unreadCount = notifications.filter((item) => item.readAt == null).length;

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.list',
      entityType: 'notification',
      requestPath: url.pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        returned: notifications.length
      }
    });

    return NextResponse.json({
      notifications,
      unreadCount
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'notifications.list',
      entityType: 'notification',
      requestPath: url.pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to list notifications'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list notifications' },
      { status: 400 }
    );
  }
}
