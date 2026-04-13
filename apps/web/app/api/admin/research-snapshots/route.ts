import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';

export async function GET(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || !hasRequiredAdminRole(actor.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401 });
  }

  try {
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

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.snapshots.list',
      entityType: 'ResearchSnapshot',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        count: snapshots.length,
        ...(assetId ? { assetId } : {})
      }
    });

    return NextResponse.json(snapshots);
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.snapshots.list',
      entityType: 'ResearchSnapshot',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to list research snapshots'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list research snapshots' },
      { status: 400 }
    );
  }
}
