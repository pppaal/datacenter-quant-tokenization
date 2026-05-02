import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import {
  grantAdminAccessScope,
  listAdminAccessGrants
} from '@/lib/security/admin-access';

export const dynamic = 'force-dynamic';

export const GET = withAdminApi({
  requiredRole: 'ADMIN',
  auditAction: 'admin_access_grants.list',
  auditEntityType: 'AdminAccessGrant',
  async handler() {
    const grants = await listAdminAccessGrants(prisma);
    return NextResponse.json({ grants });
  }
});

const CreateSchema = z.object({
  userId: z.string().min(1),
  scopeType: z.nativeEnum(AdminAccessScopeType),
  scopeId: z.string().min(1)
});

export const POST = withAdminApi({
  requiredRole: 'ADMIN',
  bodySchema: CreateSchema,
  auditAction: 'admin_access_grants.create',
  auditEntityType: 'AdminAccessGrant',
  async handler({ body, requestId }) {
    try {
      const grant = await grantAdminAccessScope(body, prisma.adminAccessGrant);
      return NextResponse.json({ grant }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create grant';
      const isDuplicate = /unique|duplicate|already/i.test(message);
      return NextResponse.json(
        { error: isDuplicate ? 'Grant already exists for this user and scope.' : message },
        { status: isDuplicate ? 409 : 500, headers: { 'X-Request-Id': requestId } }
      );
    }
  }
});
