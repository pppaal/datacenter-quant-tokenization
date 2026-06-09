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
      const message = error instanceof Error ? error.message : '';
      // Preserve the explicit "not found" business signal (404). Any other
      // failure is unexpected — rethrow so `withAdminApi` genericizes it
      // (generic message + requestId) instead of leaking `error.message`.
      if (/not found/i.test(message)) {
        return NextResponse.json(
          { error: 'Access grant not found.' },
          { status: 404, headers: { 'X-Request-Id': requestId } }
        );
      }
      throw error;
    }
  }
});
