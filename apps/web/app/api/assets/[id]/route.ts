import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { getAssetById, updateAsset } from '@/lib/services/assets';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, id, prisma);
  } catch {
    return NextResponse.json(
      { error: 'Asset access is not granted for this operator.' },
      { status: 403 }
    );
  }
  const asset = await getAssetById(id);
  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(asset);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const { id } = await params;
    await assertActorScopeAccess(actor, AdminAccessScopeType.ASSET, id, prisma);
    const payload = await request.json();
    const asset = await updateAsset(id, payload);
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.update',
      entityType: 'asset',
      entityId: asset.id,
      assetId: asset.id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        assetCode: asset.assetCode,
        status: asset.status
      }
    });
    return NextResponse.json(asset);
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'asset.update',
      entityType: 'asset',
      entityId: id,
      assetId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to update asset'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update asset' },
      { status: 400 }
    );
  }
}
