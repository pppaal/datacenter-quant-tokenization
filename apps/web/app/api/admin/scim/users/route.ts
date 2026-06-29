import { NextResponse } from 'next/server';
import { AdminAccessScopeType, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  authorizeAdminScimRequest,
  listProvisionedAdminUsers,
  upsertProvisionedAdminUser,
  ScimValidationError
} from '@/lib/security/admin-scim';
import { getRequestIpAddress } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

type ProvisionedUserPayload = {
  provider?: string;
  externalId?: string;
  email?: string;
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  grants?: Array<{
    scopeType: AdminAccessScopeType;
    scopeId: string;
  }>;
};

export async function GET(request: Request) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const users = await listProvisionedAdminUsers(prisma, {
    limit: 100
  });

  return NextResponse.json({
    users
  });
}

export async function POST(request: Request) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ProvisionedUserPayload | null;
  if (!payload?.externalId?.trim() || !payload.email?.trim() || !payload.name?.trim()) {
    return NextResponse.json(
      { error: 'externalId, email, and name are required.' },
      { status: 400 }
    );
  }

  let user;
  try {
    user = await upsertProvisionedAdminUser(
      {
        provider: payload.provider?.trim() || undefined,
        externalId: payload.externalId.trim(),
        email: payload.email.trim(),
        name: payload.name.trim(),
        role: payload.role,
        isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
        grants: payload.grants?.filter((grant) => grant.scopeId?.trim())
      },
      prisma
    );
  } catch (error) {
    if (error instanceof ScimValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await recordAuditEvent({
    actorIdentifier: `scim:${payload.provider?.trim() || 'provider'}`,
    actorRole: 'SCIM_PROVISIONER',
    action: 'admin_user.provision',
    entityType: 'User',
    entityId: user.id,
    requestPath: new URL(request.url).pathname,
    requestMethod: request.method,
    ipAddress: getRequestIpAddress(request.headers),
    metadata: {
      externalId: payload.externalId.trim(),
      email: payload.email.trim(),
      role: payload.role ?? null,
      isActive: payload.isActive ?? null,
      grantCount: payload.grants?.filter((grant) => grant.scopeId?.trim()).length ?? 0
    }
  });

  return NextResponse.json({
    ok: true,
    user
  });
}
