import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { updateAdminIdentityBindingUser } from '@/lib/security/admin-identity';

type IdentityBindingPayload = {
  bindingId?: string;
  userId?: string | null;
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
    const payload = (await request.json()) as IdentityBindingPayload;

    if (!payload.bindingId?.trim()) {
      return NextResponse.json({ error: 'bindingId is required.' }, { status: 400 });
    }

    const updatedBinding = await updateAdminIdentityBindingUser(
      {
        bindingId: payload.bindingId.trim(),
        userId: payload.userId?.trim() ? payload.userId.trim() : null
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor?.identifier ?? null,
      actorRole: actor?.role ?? null,
      action: payload.userId?.trim()
        ? 'admin_identity_binding.map'
        : 'admin_identity_binding.clear',
      entityType: 'AdminIdentityBinding',
      entityId: payload.bindingId.trim(),
      requestPath: '/api/admin/identity-bindings',
      requestMethod: 'PATCH',
      ipAddress,
      statusLabel: 'SUCCESS',
      metadata: {
        provider: updatedBinding?.provider ?? null,
        subject: updatedBinding?.subject ?? null,
        mappedUserId: updatedBinding?.userId ?? null
      }
    });

    return NextResponse.json({
      ok: true,
      binding: updatedBinding
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier ?? null,
      actorRole: actor?.role ?? null,
      action: 'admin_identity_binding.error',
      entityType: 'AdminIdentityBinding',
      requestPath: '/api/admin/identity-bindings',
      requestMethod: 'PATCH',
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to update admin identity binding.'
      }
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update admin identity binding.'
      },
      { status: 400 }
    );
  }
}
