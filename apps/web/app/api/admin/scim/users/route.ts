import { NextResponse } from 'next/server';
import { AdminAccessScopeType, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  authorizeAdminScimRequest,
  listProvisionedAdminUsers,
  upsertProvisionedAdminUser
} from '@/lib/security/admin-scim';

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
    return NextResponse.json({ error: 'externalId, email, and name are required.' }, { status: 400 });
  }

  const user = await upsertProvisionedAdminUser(
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

  return NextResponse.json({
    ok: true,
    user
  });
}
