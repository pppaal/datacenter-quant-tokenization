import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authorizeAdminScimRequest, deprovisionAdminUser } from '@/lib/security/admin-scim';
import { genericErrorResponse } from '@/lib/security/error-response';
import { getRequestIpAddress } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

type UserPatchPayload = {
  role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
  isActive?: boolean;
  name?: string;
  email?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as UserPatchPayload | null;
  if (!payload) {
    return NextResponse.json({ error: 'Patch payload is required.' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: {
      id
    },
    data: {
      role: payload.role,
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
      name: payload.name?.trim() || undefined,
      email: payload.email?.trim() || undefined
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });

  await recordAuditEvent({
    actorIdentifier: 'scim:provider',
    actorRole: 'SCIM_PROVISIONER',
    action: 'admin_user.modify',
    entityType: 'User',
    entityId: user.id,
    requestPath: new URL(request.url).pathname,
    requestMethod: request.method,
    ipAddress: getRequestIpAddress(request.headers),
    metadata: {
      role: user.role,
      isActive: user.isActive
    }
  });

  return NextResponse.json({
    ok: true,
    user
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const user = await deprovisionAdminUser(
      {
        userId: id
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: 'scim:provider',
      actorRole: 'SCIM_PROVISIONER',
      action: 'admin_user.deprovision',
      entityType: 'User',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers)
    });

    return NextResponse.json({
      ok: true,
      user
    });
  } catch (error) {
    // Preserve the explicit "not found" business signal (404) but genericize
    // any other failure so raw/Prisma internals don't leak to the client.
    const message = error instanceof Error ? error.message : '';
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: 'Provisioned user was not found.' }, { status: 404 });
    }
    return genericErrorResponse(error, {
      status: 500,
      context: { route: '/api/admin/scim/users/[id]', method: 'DELETE' }
    });
  }
}
