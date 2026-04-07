import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createAsset, listAssets } from '@/lib/services/assets';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json(assets);
}

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const payload = await request.json();
    const asset = await createAsset(payload);
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.create',
      entityType: 'asset',
      entityId: asset.id,
      assetId: asset.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        assetCode: asset.assetCode,
        assetClass: asset.assetClass,
        status: asset.status
      }
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.create',
      entityType: 'asset',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to create asset'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create asset' },
      { status: 400 }
    );
  }
}
