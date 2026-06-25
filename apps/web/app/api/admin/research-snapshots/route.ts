import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';

export const GET = withAdminApi({
  // ADMIN-only (matches the middleware `getRequiredAdminRoleForPath` gate). The
  // wrapper returns 401 for a missing actor and 403 for an authenticated actor
  // lacking the ADMIN role — the hand-rolled handler previously collapsed both
  // into a single 401.
  requiredRole: 'ADMIN',
  auditAction: 'research.snapshots.list',
  auditEntityType: 'ResearchSnapshot',
  async handler({ request }) {
    const url = new URL(request.url);
    const assetId = url.searchParams.get('assetId');

    const snapshots = await prisma.researchSnapshot.findMany({
      where: {
        viewType: 'HOUSE',
        approvalStatus: { in: ['DRAFT', 'APPROVED'] },
        ...(assetId ? { assetId } : {})
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        snapshotKey: true,
        title: true,
        snapshotType: true,
        viewType: true,
        approvalStatus: true,
        snapshotDate: true,
        approvedAt: true,
        freshnessStatus: true,
        freshnessLabel: true,
        sourceSystem: true,
        assetId: true,
        marketUniverseId: true,
        submarketId: true
      }
    });

    return NextResponse.json(snapshots);
  }
});
