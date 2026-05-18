import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { markAllNotificationsRead } from '@/lib/services/notifications';

export const POST = withAdminApi({
  auditAction: 'notifications.read_all',
  auditEntityType: 'notification',
  async handler() {
    const count = await markAllNotificationsRead();
    return NextResponse.json({ ok: true, updated: count });
  }
});
