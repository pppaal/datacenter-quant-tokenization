import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { hasRequiredAdminRole } from '@/lib/security/admin-auth';
import { uploadRateLimiter, RateLimitError } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/services/audit';
import { createDocumentStorageFromEnv } from '@/lib/storage/local';

const ALLOWED_KINDS = new Set([
  'PHOTO',
  'HERO',
  'EXTERIOR',
  'INTERIOR',
  'SITE_PLAN',
  'FLOORPLAN',
  'RENDER',
  'DRONE'
]);

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf'
]);

const MAX_BYTES = 15 * 1024 * 1024;

function sanitizeName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]+/g, '_');
  return base.length > 0 ? base : 'upload.bin';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  const { id: assetId } = await context.params;
  const media = await prisma.assetMedia.findMany({
    where: { assetId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  return NextResponse.json({
    items: media.map((m) => ({
      id: m.id,
      kind: m.kind,
      caption: m.caption,
      sortOrder: m.sortOrder,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      createdAt: m.createdAt
    }))
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
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

  const { id: assetId } = await context.params;

  try {
    uploadRateLimiter.check(actor.identifier);

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true }
    });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${MAX_BYTES}-byte upload limit.` },
        { status: 413 }
      );
    }
    const mimeType = (file.type || 'application/octet-stream').trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${mimeType}` },
        { status: 415 }
      );
    }

    const rawKind = String(formData.get('kind') ?? 'PHOTO').toUpperCase().trim();
    const kind = ALLOWED_KINDS.has(rawKind) ? rawKind : 'PHOTO';
    const caption = String(formData.get('caption') ?? '').trim() || null;
    const sortOrderRaw = Number(formData.get('sortOrder') ?? 0);
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = createDocumentStorageFromEnv();
    const versionToken = randomUUID().slice(0, 8);
    const result = await storage.save({
      assetId,
      title: 'media',
      versionNumber: 0,
      file: {
        name: `${versionToken}_${sanitizeName(file.name)}`,
        type: mimeType,
        size: file.size,
        buffer
      }
    });

    const created = await prisma.assetMedia.create({
      data: {
        assetId,
        kind,
        storagePath: result.storagePath,
        mimeType,
        sizeBytes: file.size,
        caption,
        sortOrder,
        uploadedById: actor.userId ?? null
      }
    });

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'asset.media.upload',
      entityType: 'asset',
      entityId: assetId,
      assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: { mediaId: created.id, kind, mimeType, sizeBytes: file.size }
    });

    return NextResponse.json({
      ok: true,
      id: created.id,
      kind: created.kind,
      caption: created.caption,
      sortOrder: created.sortOrder,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'asset.media.upload',
      entityType: 'asset',
      entityId: assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: { error: error instanceof Error ? error.message : 'Failed to upload asset media' }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload asset media' },
      { status: 400 }
    );
  }
}
