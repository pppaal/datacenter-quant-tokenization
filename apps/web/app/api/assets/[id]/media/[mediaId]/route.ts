import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { recordAuditEvent } from '@/lib/services/audit';
import { createDocumentStorageFromEnv } from '@/lib/storage/local';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  if (!hasRequiredAdminRole(actor.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient role.' }, { status: 403 });
  }

  const { id: assetId, mediaId } = await context.params;

  const media = await prisma.assetMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.assetId !== assetId) {
    return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
  }

  const storage = createDocumentStorageFromEnv();
  await storage.delete(media.storagePath).catch(() => undefined);
  await prisma.assetMedia.delete({ where: { id: mediaId } });

  await recordAuditEvent({
    actorIdentifier: actor.identifier,
    actorRole: actor.role,
    action: 'asset.media.delete',
    entityType: 'asset',
    entityId: assetId,
    assetId,
    requestPath: new URL(request.url).pathname,
    requestMethod: request.method,
    ipAddress: getRequestIpAddress(request.headers),
    metadata: { mediaId }
  });

  return NextResponse.json({ ok: true });
}
