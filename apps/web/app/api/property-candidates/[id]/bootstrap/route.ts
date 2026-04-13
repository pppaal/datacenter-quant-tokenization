import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { bootstrapPropertyCandidate } from '@/lib/services/property-explorer';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });

  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const asset = await bootstrapPropertyCandidate(id, prisma);
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'property_candidate.bootstrap',
      entityType: 'asset',
      entityId: asset.id,
      assetId: asset.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        candidateId: id,
        assetCode: asset.assetCode,
        assetClass: asset.assetClass
      }
    });
    return NextResponse.json({ id: asset.id, assetCode: asset.assetCode }, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'property_candidate.bootstrap',
      entityType: 'asset',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        candidateId: id,
        error: error instanceof Error ? error.message : 'Failed to bootstrap property candidate'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bootstrap property candidate' },
      { status: 400 }
    );
  }
}
