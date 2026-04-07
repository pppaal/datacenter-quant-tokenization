import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestIpAddress, resolveVerifiedAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { updateValuationApproval } from '@/lib/services/valuations';

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
    const payload = await request.json();
    const run = await updateValuationApproval(id, payload, actor ?? {});

    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'valuation.run.approval',
      entityType: 'valuation_run',
      entityId: run.id,
      assetId: run.assetId,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      metadata: {
        approvalStatus: run.approvalStatus,
        approvedByLabel: run.approvedByLabel
      }
    });

    return NextResponse.json(run);
  } catch (error) {
    const { id } = await params;
    await recordAuditEvent({
      actorIdentifier: actor?.identifier,
      actorRole: actor?.role,
      action: 'valuation.run.approval',
      entityType: 'valuation_run',
      entityId: id,
      requestPath: new URL(request.url).pathname,
      requestMethod: request.method,
      ipAddress: getRequestIpAddress(request.headers),
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to update valuation approval'
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update valuation approval' },
      { status: 400 }
    );
  }
}
