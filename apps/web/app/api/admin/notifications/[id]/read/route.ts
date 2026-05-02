import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { markNotificationRead } from '@/lib/services/notifications';

export const POST = withAdminApi<undefined, { id: string }>({
  auditAction: 'notifications.read',
  auditEntityType: 'notification',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ params }) {
    const notification = await markNotificationRead(params.id);
    return NextResponse.json({ ok: true, notification });
  }
});
