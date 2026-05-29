import { NextResponse } from 'next/server';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { getAnalysisSnapshotById } from '@/lib/services/property-analyzer/snapshot';

/** Stable-URL retrieval of one immutable property-analysis snapshot by id. */
export const GET = withAdminApi<undefined, { id: string }>({
  requiredRole: 'VIEWER',
  auditAction: 'property-analysis.snapshots.get',
  auditEntityType: 'PropertyAnalysisSnapshot',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ params }) {
    const snapshot = await getAnalysisSnapshotById(params.id);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found.' }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  }
});
