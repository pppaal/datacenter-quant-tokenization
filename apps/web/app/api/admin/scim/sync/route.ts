import { NextResponse } from 'next/server';
import { AdminAccessScopeType, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  authorizeAdminScimRequest,
  reconcileProvisionedAdminUsers
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

type ScimSyncPayload = {
  provider?: string;
  deprovisionMissing?: boolean;
  users?: ProvisionedUserPayload[];
};

export async function POST(request: Request) {
  if (!authorizeAdminScimRequest(request)) {
    return NextResponse.json({ error: 'SCIM token required.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ScimSyncPayload | null;
  if (!payload?.users || !Array.isArray(payload.users)) {
    return NextResponse.json({ error: 'users array is required.' }, { status: 400 });
  }

  const result = await reconcileProvisionedAdminUsers(
    {
      provider: payload.provider?.trim() || undefined,
      deprovisionMissing: payload.deprovisionMissing !== false,
      users: payload.users
        .filter((user) => user.externalId?.trim() && user.email?.trim() && user.name?.trim())
        .map((user) => ({
          provider: user.provider?.trim() || undefined,
          externalId: user.externalId!.trim(),
          email: user.email!.trim(),
          name: user.name!.trim(),
          role: user.role,
          isActive: typeof user.isActive === 'boolean' ? user.isActive : undefined,
          grants: user.grants?.filter((grant) => grant.scopeId?.trim())
        }))
    },
    prisma
  );

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    upsertedCount: result.upsertedUsers.length,
    deprovisionedCount: result.deprovisionedUsers.length
  });
}
