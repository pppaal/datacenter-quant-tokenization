import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { revokeAdminAccessGrant } from '@/lib/security/admin-access';
import { withAdminApi } from '@/lib/security/with-admin-api';

export const DELETE = withAdminApi<undefined, { id: string }>({
  requiredRole: 'ADMIN',
  auditAction: 'admin_access_grants.revoke',
  auditEntityType: 'AdminAccessGrant',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ params, requestId }) {
    try {
      await revokeAdminAccessGrant(params.id, prisma.adminAccessGrant);
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revoke failed';
      const isMissing = /not found/i.test(message);
      return NextResponse.json(
        { error: message },
        { status: isMissing ? 404 : 500, headers: { 'X-Request-Id': requestId } }
      );
    }
  }
});
