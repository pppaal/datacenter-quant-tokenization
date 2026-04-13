import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { approveResearchHouseViewSnapshot } from '@/lib/services/research/governance';
import { mutationRateLimiter, RateLimitError } from '@/lib/security/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor || actor.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin operator session required.' }, { status: 401 });
  }

  try {
    mutationRateLimiter.check(actor.identifier);

    const { id } = await params;
    const approvedSnapshot = await approveResearchHouseViewSnapshot(
      id,
      {
        userId: actor.userId ?? null,
        identifier: actor.identifier
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.house_view.approve',
      entityType: 'ResearchSnapshot',
      entityId: approvedSnapshot.id,
      assetId: approvedSnapshot.assetId ?? null,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        snapshotType: approvedSnapshot.snapshotType,
        marketUniverseId: approvedSnapshot.marketUniverseId,
        submarketId: approvedSnapshot.submarketId,
        approvedAt: approvedSnapshot.approvedAt?.toISOString() ?? null
      }
    });

    return NextResponse.json({
      id: approvedSnapshot.id,
      approvalStatus: approvedSnapshot.approvalStatus
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'research.house_view.approve',
      entityType: 'ResearchSnapshot',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to approve house view'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve house view' },
      { status: 400 }
    );
  }
}
