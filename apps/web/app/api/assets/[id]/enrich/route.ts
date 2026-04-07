import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { enrichAssetFromSources } from '@/lib/services/assets';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const asset = await enrichAssetFromSources(id);
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.enrich',
      entityType: 'asset',
      entityId: id,
      assetId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        assetCode: asset?.assetCode,
        status: asset?.status
      }
    });
    return NextResponse.redirect(new URL(`/admin/assets/${id}`, request.url));
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.enrich',
      entityType: 'asset',
      entityId: id,
      assetId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to enrich asset'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich asset' },
      { status: 400 }
    );
  }
}
