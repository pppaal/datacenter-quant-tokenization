import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { listAnalysisSnapshots } from '@/lib/services/property-analyzer/snapshot';

/**
 * History list of persisted property-analysis snapshots, filtered by `pnu` or
 * free-text `address`. Newest first; omits the heavy report blob.
 */
export const GET = withAdminApi({
  requiredRole: 'VIEWER',
  auditAction: 'property-analysis.snapshots.list',
  auditEntityType: 'PropertyAnalysisSnapshot',
  async handler({ request }) {
    const url = new URL(request.url);
    const pnu = url.searchParams.get('pnu')?.trim() || undefined;
    const address = url.searchParams.get('address')?.trim() || undefined;
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const items = await listAnalysisSnapshots(
      { pnu, address },
      { limit: Number.isFinite(limit) ? limit : undefined }
    );
    return NextResponse.json({ items });
  }
});
