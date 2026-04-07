import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { rotateAdminOperatorSessionVersion, updateAdminOperatorSeat } from '@/lib/security/admin-identity';
import { revokePersistedAdminSessionsForUser } from '@/lib/security/admin-session';
import { recordAuditEvent } from '@/lib/services/audit';

type OperatorPayload = {
  userId?: string;
  role?: 'VIEWER' | 'ANALYST' | 'ADMIN';
  isActive?: boolean;
  rotateSessionVersion?: boolean;
};

export async function PATCH(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active admin session required.' }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as OperatorPayload;
    if (!payload.userId?.trim()) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    const updatedUser = payload.rotateSessionVersion
      ? await rotateAdminOperatorSessionVersion(
          {
            userId: payload.userId.trim()
          },
          prisma
        )
      : await updateAdminOperatorSeat(
          {
            userId: payload.userId.trim(),
            role: payload.role,
            isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
            actingUserId: actor.userId ?? null
          },
          prisma
        );

    const revokedSessions = await revokePersistedAdminSessionsForUser(updatedUser.id, prisma);

    await recordAuditEvent({
      actorIdentifier: actor?.identifier ?? null,
      actorRole: actor?.role ?? null,
      action: 'admin_operator.update',
      entityType: 'User',
      entityId: updatedUser.id,
      requestPath: '/api/admin/operators',
      requestMethod: 'PATCH',
      ipAddress,
      statusLabel: 'SUCCESS',
      metadata: {
        nextRole: updatedUser.role,
        isActive: updatedUser.isActive,
        sessionVersion: updatedUser.sessionVersion ?? null,
        rotatedSessions: Boolean(payload.rotateSessionVersion),
        revokedSessionCount: revokedSessions.count
      }
    });

    return NextResponse.json({
      ok: true,
      user: updatedUser,
      revokedSessionCount: revokedSessions.count
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier ?? null,
      actorRole: actor?.role ?? null,
      action: 'admin_operator.error',
      entityType: 'User',
      requestPath: '/api/admin/operators',
      requestMethod: 'PATCH',
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to update operator seat.'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update operator seat.' },
      { status: 400 }
    );
  }
}
