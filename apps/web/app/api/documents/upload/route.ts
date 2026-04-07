import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { uploadDocumentVersion } from '@/lib/services/documents';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { UploadPolicyError, validateDocumentUpload } from '@/lib/security/upload-policy';
import { recordAuditEvent } from '@/lib/services/audit';

export async function POST(request: Request) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    validateDocumentUpload(file);

    const payload = Object.fromEntries(formData.entries());
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadDocumentVersion(payload, {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      buffer
    });
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'document.upload',
      entityType: 'document',
      entityId: document.id,
      assetId: document.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        documentType: document.documentType,
        currentVersion: document.currentVersion,
        title: document.title
      }
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'document.upload',
      entityType: 'document',
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to upload document'
      }
    });
    if (error instanceof UploadPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload document' },
      { status: 400 }
    );
  }
}
