import { NextResponse } from 'next/server';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import {
  getRequestIpAddress,
  resolveVerifiedAdminActorFromHeaders
} from '@/lib/security/admin-request';
import { UploadPolicyError, validateDocumentUpload } from '@/lib/security/upload-policy';
import { recordAuditEvent } from '@/lib/services/audit';
import { uploadDocumentVersion } from '@/lib/services/documents';
import { attachDealDiligenceDeliverable } from '@/lib/services/deals';
import { uploadRateLimiter, RateLimitError } from '@/lib/security/rate-limit';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
      workstreamId: string;
    }>;
  }
) {
  const actor = await resolveVerifiedAdminActorFromHeaders(request.headers, prisma, {
    allowBasic: false,
    requireActiveSeat: true
  });
  if (!actor) {
    return NextResponse.json({ error: 'Active operator session required.' }, { status: 401 });
  }

  const { id, workstreamId } = await context.params;

  try {
    uploadRateLimiter.check(actor.identifier);

    await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, id, prisma);

    const deal = await prisma.deal.findUnique({
      where: { id },
      select: {
        assetId: true
      }
    });

    if (!deal?.assetId) {
      return NextResponse.json(
        { error: 'Deal must be linked to an asset before uploading diligence deliverables.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    validateDocumentUpload(file);

    const title = String(formData.get('title') ?? '').trim();
    const documentType = String(formData.get('documentType') ?? '').trim();
    const sourceLink = String(formData.get('sourceLink') ?? '').trim();
    const extractedText = String(formData.get('extractedText') ?? '').trim();
    const note = String(formData.get('note') ?? '').trim();

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await uploadDocumentVersion(
      {
        assetId: deal.assetId,
        dealId: id,
        title,
        documentType,
        sourceLink: sourceLink || undefined,
        extractedText: extractedText || undefined,
        uploadedById: actor.userId ?? undefined
      },
      {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        buffer
      }
    );

    await attachDealDiligenceDeliverable(
      id,
      workstreamId,
      {
        documentId: document.id,
        note: note || null
      },
      prisma
    );

    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.diligence_deliverable.upload',
      entityType: 'deal',
      entityId: id,
      assetId: deal.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        workstreamId,
        documentId: document.id,
        title: document.title
      }
    });

    return NextResponse.json({
      ok: true,
      documentId: document.id,
      title: document.title
    });
  } catch (error) {
    await recordAuditEvent({
      actorIdentifier: actor.identifier,
      actorRole: actor.role,
      action: 'deal.diligence_deliverable.upload',
      entityType: 'deal',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        workstreamId,
        error: error instanceof Error ? error.message : 'Failed to upload diligence deliverable'
      }
    });

    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error instanceof UploadPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload diligence deliverable' },
      { status: 400 }
    );
  }
}
