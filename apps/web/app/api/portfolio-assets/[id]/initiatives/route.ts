import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { createAssetManagementInitiative } from '@/lib/services/asset-management';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  const ipAddress = getRequestIpAddress(request.headers);

  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const portfolioAsset = await prisma.portfolioAsset.findUnique({
      where: { id },
      select: {
        id: true,
        portfolioId: true,
        assetId: true
      }
    });

    if (!portfolioAsset) {
      return NextResponse.json({ error: 'Portfolio asset not found.' }, { status: 404 });
    }

    await assertActorScopeAccess(actor, AdminAccessScopeType.PORTFOLIO, portfolioAsset.portfolioId, prisma);
    const payload = await request.json();
    const initiative = await createAssetManagementInitiative(portfolioAsset.id, payload, prisma);

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'portfolio.initiative.create',
      entityType: 'AssetManagementInitiative',
      entityId: initiative.id,
      assetId: portfolioAsset.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      metadata: {
        portfolioAssetId: portfolioAsset.id,
        status: initiative.status,
        priority: initiative.priority,
        title: initiative.title
      }
    });

    return NextResponse.json(initiative, { status: 201 });
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'portfolio.initiative.create',
      entityType: 'PortfolioAsset',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress,
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to create asset-management initiative'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create asset-management initiative' },
      { status: 400 }
    );
  }
}
