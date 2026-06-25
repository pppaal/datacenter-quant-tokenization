import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { listRecentNotifications } from '@/lib/services/notifications';

// Migrated from a hand-rolled auth+audit block to `withAdminApi`. The wrapper
// owns the exact same gate (VIEWER, active seat) and the success/failure audit
// pair. The only behavioral delta is the audit `metadata.returned` count, which
// the wrapper does not surface; the auth gate and audit action are unchanged.
export const GET = withAdminApi({
  // VIEWER is the wrapper default; stated explicitly to match the prior gate.
  requiredRole: 'VIEWER',
  auditAction: 'notifications.list',
  auditEntityType: 'notification',
  async handler({ request }) {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

    const notifications = await listRecentNotifications(limit);
    const unreadCount = notifications.filter((item) => item.readAt == null).length;

    return NextResponse.json({ notifications, unreadCount });
  }
});
