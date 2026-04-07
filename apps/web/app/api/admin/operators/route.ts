import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { updateAdminOperatorSeat } from '@/lib/security/admin-identity';
import { recordAuditEvent } from '@/lib/services/audit';

type OperatorPayload = {
  userId?: string;
  role?: 'VIEWER' | 'ANALYST' | 'ADMIN';
  isActive?: boolean;
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

    const updatedUser = await updateAdminOperatorSeat(
      {
        userId: payload.userId.trim(),
        role: payload.role,
        isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined
      },
      prisma
    );

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
        isActive: updatedUser.isActive
      }
    });

    return NextResponse.json({
      ok: true,
      user: updatedUser
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
